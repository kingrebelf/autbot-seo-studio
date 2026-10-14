import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync, renameSync, existsSync, unlinkSync, readFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { and, desc, eq, like, or } from 'drizzle-orm'
import { getDb, schema } from '../db'
import { rt } from '../runtime'
import { runChat, runImage } from '../ai'
import { prompt } from '../prompts'
import { getSite, systemPrompt, imageStyleOf } from '../sites'
import { getContent, updateContent } from '../content'
import { ImagePromptsSchema, ImageTextSchema, type ImageText } from './schemas'
import { analyze } from './html'
import { slugify } from './text'
import { UserError } from '../errors'

export type ImageRow = typeof schema.images.$inferSelect

export function imageDir(siteId: number): string {
  const d = join(rt().dataDir, 'images', String(siteId))
  mkdirSync(d, { recursive: true })
  return d
}

export interface Optimized {
  webp: Buffer
  fallback?: Buffer
  fallbackExt?: 'png' | 'jpg'
  width: number
  height: number
}

/** Convert to WebP, resize to max 1600px wide (or crop 1200x630 for social), compress. */
export async function optimizeImage(
  input: Buffer,
  opts: { socialCrop?: boolean; fallback?: 'png' | 'jpg' | null } = {}
): Promise<Optimized> {
  let img = sharp(input, { failOn: 'none' }).rotate()
  img = opts.socialCrop
    ? img.resize(1200, 630, { fit: 'cover', position: 'attention' })
    : img.resize({ width: 1600, withoutEnlargement: true })
  const webp = await img.clone().webp({ quality: 80 }).toBuffer()
  const meta = await sharp(webp).metadata()
  const out: Optimized = { webp, width: meta.width ?? 0, height: meta.height ?? 0 }
  if (opts.fallback === 'png') {
    out.fallback = await img.clone().png({ compressionLevel: 9 }).toBuffer()
    out.fallbackExt = 'png'
  } else if (opts.fallback === 'jpg') {
    out.fallback = await img.clone().jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    out.fallbackExt = 'jpg'
  }
  return out
}

function uniqueFilename(siteId: number, base: string, ext: string, ignoreId?: number): string {
  const clean = slugify(base.replace(/\.[a-z0-9]+$/i, '')) || 'image'
  const taken = new Set(
    getDb()
      .select()
      .from(schema.images)
      .where(eq(schema.images.siteId, siteId))
      .all()
      .filter((i) => i.id !== ignoreId)
      .map((i) => i.filename)
  )
  let name = `${clean}.${ext}`
  for (let n = 2; taken.has(name); n++) name = `${clean}-${n}.${ext}`
  return name
}

async function storeImage(
  siteId: number,
  contentId: number | null,
  slot: string,
  buf: Buffer,
  opts: { socialCrop?: boolean; aiPrompt?: string; modelId?: string; ai: boolean; selected: boolean }
): Promise<ImageRow> {
  const site = getSite(siteId)
  const fb = (site.settings as { imageFallback?: 'png' | 'jpg' | null } | null)?.imageFallback ?? null
  const o = await optimizeImage(buf, { socialCrop: opts.socialCrop, fallback: fb })
  const dir = imageDir(siteId)
  const tmp = `img-${randomUUID()}.webp`
  writeFileSync(join(dir, tmp), o.webp)
  let fallbackPath: string | null = null
  if (o.fallback) {
    fallbackPath = join(dir, tmp.replace(/\.webp$/, `.${o.fallbackExt}`))
    writeFileSync(fallbackPath, o.fallback)
  }
  return getDb()
    .insert(schema.images)
    .values({
      siteId,
      contentId,
      slot,
      filePath: join(dir, tmp),
      fallbackPath,
      filename: tmp,
      prompt: opts.aiPrompt ?? null,
      modelId: opts.modelId ?? null,
      width: o.width,
      height: o.height,
      aiGenerated: opts.ai,
      selected: opts.selected
    })
    .returning()
    .get()
}

export function getImage(id: number): ImageRow {
  const i = getDb().select().from(schema.images).where(eq(schema.images.id, id)).get()
  if (!i) throw new UserError('That image no longer exists.')
  return i
}

export function imagesFor(contentId: number): ImageRow[] {
  return getDb()
    .select()
    .from(schema.images)
    .where(eq(schema.images.contentId, contentId))
    .orderBy(schema.images.id)
    .all()
}

export function library(siteId: number, search = ''): ImageRow[] {
  const q = `%${search}%`
  return getDb()
    .select()
    .from(schema.images)
    .where(
      search
        ? and(
            eq(schema.images.siteId, siteId),
            or(
              like(schema.images.filename, q),
              like(schema.images.alt, q),
              like(schema.images.prompt, q),
              like(schema.images.caption, q)
            )
          )
        : eq(schema.images.siteId, siteId)
    )
    .orderBy(desc(schema.images.id))
    .all()
}

/** The AI writes an image prompt for each slot from the content and the site's style. */
export async function planImagePrompts(
  contentId: number,
  slots: string[],
  signal?: AbortSignal
): Promise<{ slot: string; prompt: string }[]> {
  const c = getContent(contentId)
  const site = getSite(c.siteId)
  const st = imageStyleOf(site)
  const headings = analyze(c.bodyHtml ?? '')
    .headings.filter((h) => h.level === 2)
    .map((h) => h.text)
  const r = await runChat(
    {
      task: 'quick',
      system: systemPrompt(site),
      prompt: prompt('image-prompt', {
        content_type: c.type,
        title: c.title,
        keyword: c.focusKeyword,
        slots: slots
          .map((s) =>
            s === 'featured'
              ? 'featured (main image, also used for social sharing)'
              : `${s} (goes with the section "${headings[Number(s.split('-')[1]) - 1] ?? 'body'}")`
          )
          .join('; '),
        style: st.style,
        brand_colors: st.brandColors,
        avoid: st.avoid,
        summary: analyze(c.bodyHtml ?? '').text.slice(0, 1500)
      }),
      schema: ImagePromptsSchema
    },
    { siteId: c.siteId, contentId, signal }
  )
  const bySlot = new Map(r.data.slots.map((s) => [s.slot.split(' ')[0], s.prompt]))
  const plan = slots.map((s, i) => ({
    slot: s,
    prompt: bySlot.get(s) ?? r.data.slots[i]?.prompt ?? `${c.title}, ${st.style}, ${st.avoid}`
  }))
  const checks = { ...((c.checks ?? {}) as Record<string, unknown>), imagePlan: plan }
  updateContent(contentId, { checks })
  return plan
}

/** Generate 1 to 4 options for a slot. Options start unselected until the user picks one. */
export async function generateOptions(
  contentId: number,
  slot: string,
  imagePrompt: string,
  count: number,
  signal?: AbortSignal
): Promise<ImageRow[]> {
  const c = getContent(contentId)
  const st = imageStyleOf(getSite(c.siteId))
  const full = `${imagePrompt}\nStyle: ${st.style}.${st.brandColors ? ` Brand colors: ${st.brandColors}.` : ''} Avoid: ${st.avoid}.`
  const size = slot === 'featured' ? '1536x1024' : '1536x1024'
  const n = Math.min(4, Math.max(1, count))
  const r = await runImage(full, size, n, { siteId: c.siteId, contentId, signal })
  const out: ImageRow[] = []
  for (const buf of r.images)
    out.push(
      await storeImage(c.siteId, contentId, slot, buf, {
        socialCrop:
          slot === 'featured' &&
          Boolean((getSite(c.siteId).settings as { socialCrop?: boolean } | null)?.socialCrop),
        aiPrompt: full,
        modelId: `${r.model.providerId}/${r.model.modelId}`,
        ai: true,
        selected: false
      })
    )
  return out
}

/** Vision model looks at the final image plus article context and writes its text details. */
export async function describeImage(imageId: number, signal?: AbortSignal): Promise<ImageText> {
  const im = getImage(imageId)
  const c = im.contentId ? getContent(im.contentId) : null
  const site = getSite(im.siteId)
  const small = await sharp(readFileSync(im.filePath))
    .resize({ width: 768, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()
  const ext = extname(im.filePath).slice(1) || 'webp'
  const r = await runChat(
    {
      task: 'vision',
      system: systemPrompt(site),
      prompt: [
        {
          type: 'text',
          text: prompt('image-text', {
            title: c?.title ?? 'website image',
            keyword: c?.focusKeyword ?? '',
            slot: im.slot ?? 'library',
            context: c ? analyze(c.bodyHtml ?? '').text.slice(0, 1200) : site.name,
            ext
          })
        },
        { type: 'image', mimeType: 'image/jpeg', dataBase64: small.toString('base64') }
      ],
      schema: ImageTextSchema
    },
    { siteId: im.siteId, contentId: im.contentId, signal }
  )
  const t = r.data
  const label = imageStyleOf(site).labelAiImages && im.aiGenerated
  const details: ImageText = {
    filename: t.filename,
    alt: t.alt.slice(0, 125),
    title: t.title,
    caption:
      label && !/AI-generated/i.test(t.caption)
        ? `${t.caption}${t.caption ? ' ' : ''}(AI-generated image)`.trim()
        : t.caption,
    description:
      label && !/AI-generated/i.test(t.description) ? `${t.description} AI-generated image.` : t.description
  }
  applyImageText(imageId, details)
  return details
}

/** Save text details and rename the file to its SEO filename. */
export function applyImageText(imageId: number, t: Partial<ImageText>): ImageRow {
  const im = getImage(imageId)
  const patch: Partial<typeof schema.images.$inferInsert> = { updatedAt: Date.now() }
  if (t.alt !== undefined) patch.alt = t.alt.slice(0, 125)
  if (t.title !== undefined) patch.title = t.title
  if (t.caption !== undefined) patch.caption = t.caption
  if (t.description !== undefined) patch.description = t.description
  if (t.filename) {
    const ext = extname(im.filePath).slice(1) || 'webp'
    const name = uniqueFilename(im.siteId, t.filename, ext, im.id)
    if (name !== im.filename) {
      const dest = join(imageDir(im.siteId), name)
      if (existsSync(im.filePath)) renameSync(im.filePath, dest)
      patch.filePath = dest
      patch.filename = name
      if (im.fallbackPath && existsSync(im.fallbackPath)) {
        const fext = extname(im.fallbackPath)
        const fdest = dest.replace(/\.[a-z]+$/, fext)
        renameSync(im.fallbackPath, fdest)
        patch.fallbackPath = fdest
      }
    }
  }
  getDb().update(schema.images).set(patch).where(eq(schema.images.id, imageId)).run()
  syncImageInBody(imageId)
  return getImage(imageId)
}

export const mediaUrl = (id: number) => `autbot-media://img/${id}`

function imgTag(im: ImageRow): string {
  return `<img src="${mediaUrl(im.id)}" data-image-id="${im.id}" alt="${escapeHtml(im.alt ?? '')}" title="${escapeHtml(im.title ?? '')}" width="${im.width ?? ''}" height="${im.height ?? ''}">`
}

function figureHtml(im: ImageRow): string {
  return `<figure>${imgTag(im)}${im.caption ? `<figcaption>${escapeHtml(im.caption)}</figcaption>` : ''}</figure>`
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Keep alt/title in the article body in step with the image record. */
function syncImageInBody(imageId: number): void {
  const im = getImage(imageId)
  if (!im.contentId) return
  const c = getContent(im.contentId)
  const html = c.bodyHtml ?? ''
  const fig = new RegExp(`<figure>\\s*<img[^>]*data-image-id="${im.id}"[\\s\\S]*?</figure>`, 'g')
  const img = new RegExp(`<img[^>]*data-image-id="${im.id}"[^>]*>`, 'g')
  const next = fig.test(html) ? html.replace(fig, figureHtml(im)) : html.replace(img, imgTag(im))
  if (next !== html) updateContent(c.id, { bodyHtml: next })
}

/** User picks one option for a slot: select it, write its text details, place it in the article. */
export async function pickImage(imageId: number, signal?: AbortSignal): Promise<ImageRow> {
  const im = getImage(imageId)
  if (!im.contentId) throw new UserError('This image is not attached to a piece of content.')
  const db = getDb()
  const others = db
    .select()
    .from(schema.images)
    .where(and(eq(schema.images.contentId, im.contentId), eq(schema.images.slot, im.slot ?? '')))
    .all()
  const prevSelected = others.find((o) => o.selected && o.id !== im.id)
  db.update(schema.images)
    .set({ selected: false })
    .where(and(eq(schema.images.contentId, im.contentId), eq(schema.images.slot, im.slot ?? '')))
    .run()
  db.update(schema.images).set({ selected: true }).where(eq(schema.images.id, imageId)).run()
  if (!im.alt) await describeImage(imageId, signal)
  const fresh = getImage(imageId)
  if (im.slot && im.slot !== 'featured') placeInBody(fresh, prevSelected?.id)
  return getImage(imageId)
}

function placeInBody(im: ImageRow, replaceId?: number): void {
  const c = getContent(im.contentId!)
  let html = c.bodyHtml ?? ''
  const fig = figureHtml(im)
  if (replaceId) {
    const re = new RegExp(
      `<figure>\\s*<img[^>]*data-image-id="${replaceId}"[\\s\\S]*?</figure>|<img[^>]*data-image-id="${replaceId}"[^>]*>`
    )
    if (re.test(html)) {
      updateContent(c.id, { bodyHtml: html.replace(re, fig) }, 'Swapped image')
      return
    }
  }
  if (html.includes(`data-image-id="${im.id}"`)) return
  const n = Number(im.slot?.split('-')[1] ?? 1)
  // after the first paragraph following the n-th H2
  let count = 0
  let idx = -1
  const h2 = /<\/h2>/gi
  let m: RegExpExecArray | null
  while ((m = h2.exec(html))) {
    count++
    if (count === n) {
      const pEnd = html.indexOf('</p>', m.index)
      idx = pEnd >= 0 ? pEnd + 4 : m.index + 5
      break
    }
  }
  html = idx >= 0 ? html.slice(0, idx) + fig + html.slice(idx) : html + fig
  updateContent(c.id, { bodyHtml: html }, 'Added image')
}

/** "Use my own image": optimize it and generate all its text details. */
export async function addOwnImage(
  siteId: number,
  contentId: number | null,
  slot: string,
  data: Buffer,
  signal?: AbortSignal
): Promise<ImageRow> {
  const im = await storeImage(siteId, contentId, slot, data, {
    ai: false,
    selected: false,
    socialCrop: false
  })
  try {
    await describeImage(im.id, signal)
  } catch (e) {
    // No vision model: keep the image, the user can type the details.
    if (!(e instanceof UserError && e.code === 'no_model')) throw e
  }
  if (contentId) return pickImage(im.id, signal)
  return getImage(im.id)
}

export function deleteImage(id: number): void {
  const im = getImage(id)
  for (const p of [im.filePath, im.fallbackPath]) if (p && existsSync(p)) unlinkSync(p)
  if (im.contentId) {
    const c = getContent(im.contentId)
    const re = new RegExp(
      `<figure>\\s*<img[^>]*data-image-id="${id}"[\\s\\S]*?</figure>|<img[^>]*data-image-id="${id}"[^>]*>`,
      'g'
    )
    if (re.test(c.bodyHtml ?? ''))
      updateContent(c.id, { bodyHtml: (c.bodyHtml ?? '').replace(re, '') }, 'Removed image')
  }
  getDb().delete(schema.images).where(eq(schema.images.id, id)).run()
}

/** Attach a library image to a piece (reuse). */
export function reuseImage(imageId: number, contentId: number, slot: string): ImageRow {
  const src = getImage(imageId)
  const copy = getDb()
    .insert(schema.images)
    .values({
      ...src,
      id: undefined,
      contentId,
      slot,
      selected: true,
      wpMediaId: src.wpMediaId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    .returning()
    .get()
  getDb()
    .update(schema.images)
    .set({ selected: false })
    .where(and(eq(schema.images.contentId, contentId), eq(schema.images.slot, slot)))
    .run()
  getDb().update(schema.images).set({ selected: true }).where(eq(schema.images.id, copy.id)).run()
  if (slot !== 'featured') placeInBody(getImage(copy.id))
  return getImage(copy.id)
}

import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { route, siteIdInput, idInput } from './route'
import { rt } from '../runtime'
import { getDb, schema } from '../db'
import {
  getContent,
  listContent,
  createContent,
  updateContent,
  scoreContent,
  listVersions,
  restoreVersion,
  deleteContent,
  unresolvedConfirms
} from '../content'
import {
  applyChoice,
  suggestAltKeywords,
  fixCheck,
  rewriteSelection,
  regenerateSection,
  applySuggestion,
  insertSuggestedLinks,
  dismissConfirms,
  YMYL_RE
} from '../pipeline/steps'
import { enqueue, activeJobFor, finishWaiting } from '../jobs/queue'
import { sendToWordPress, markPublished, requestIndexing } from '../publish/send'
import { exportZip, exportFolder, buildExportFiles, htmlToMarkdown, localizeImages } from '../publish/export'
import { imagesFor } from '../pipeline/images'
import { getSite, settingsOf } from '../sites'
import { inspectionUiUrl, gscConnected } from '../indexing/gsc'
import { startRefresh } from '../pipeline/modes'
import { UserError } from '../errors'
import { EXPORT_FORMATS, CONTENT_TYPES, type ExportFormat } from '@shared/types'

const modelRef = z.object({ providerId: z.string(), modelId: z.string() })

const metaPatch = z.object({
  title: z.string().optional(),
  seoTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  slug: z.string().optional(),
  focusKeyword: z.string().optional(),
  secondaryKeywords: z.array(z.string()).optional(),
  excerpt: z.string().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  type: z.enum(CONTENT_TYPES).optional(),
  schema: z.unknown().optional(),
  bodyHtml: z.string().optional()
})

function full(id: number) {
  const c = getContent(id)
  return {
    ...c,
    images: imagesFor(id),
    activeJob: activeJobFor(id) ?? null,
    unresolvedConfirms: unresolvedConfirms(c),
    ymyl:
      Boolean((c.checks as { ymyl?: boolean } | null)?.ymyl) ||
      YMYL_RE.test(`${c.focusKeyword} ${c.title} ${c.topic}`)
  }
}

export const contentRoutes = {
  'content.list': route(siteIdInput, ({ siteId }) => listContent(siteId)),
  'content.get': route(idInput, ({ id }) => full(id)),
  /** Mode A: start a new piece from a topic. */
  'content.create': route(
    z.object({
      siteId: z.number(),
      topic: z.string().min(2, 'Type a topic, product or service'),
      notes: z.string().optional(),
      type: z.enum(CONTENT_TYPES).optional(),
      calendarItemId: z.number().optional(),
      modelOverrides: z.record(z.string(), modelRef).optional()
    }),
    ({ siteId, topic, notes, type, calendarItemId, modelOverrides }) => {
      const site = getSite(siteId)
      const c = createContent({
        siteId,
        topic: topic.trim(),
        notes: notes ?? null,
        mode: 'A',
        type: type ?? settingsOf(site).defaultContentType ?? 'blog post',
        status: 'Researching',
        calendarItemId: calendarItemId ?? null,
        modelOverrides: modelOverrides ?? null
      })
      if (calendarItemId)
        getDb()
          .update(schema.calendarItems)
          .set({ contentId: c.id, status: 'started' })
          .where(eq(schema.calendarItems.id, calendarItemId))
          .run()
      enqueue({ type: 'research', siteId, contentId: c.id })
      return c.id
    }
  ),
  'content.rerunResearch': route(idInput, ({ id }) => {
    const c = getContent(id)
    enqueue({ type: 'research', siteId: c.siteId, contentId: id })
  }),
  'content.choose': route(
    z.object({
      contentId: z.number(),
      keyword: z.string().min(2, 'Pick or type a keyword'),
      contentType: z.enum(CONTENT_TYPES),
      length: z.enum(['short', 'standard', 'indepth', 'auto']),
      notes: z.string().optional(),
      force: z.boolean().optional(),
      modelOverrides: z.record(z.string(), modelRef).optional()
    }),
    (i) => {
      const r = applyChoice(i)
      if (!r.conflicts.length) {
        finishWaiting(i.contentId)
        const c = getContent(i.contentId)
        enqueue({ type: 'brief', siteId: c.siteId, contentId: c.id })
      }
      return r
    }
  ),
  'content.altKeywords': route(
    z.object({ contentId: z.number(), keyword: z.string(), existing: z.string() }),
    ({ contentId, keyword, existing }) => suggestAltKeywords(contentId, keyword, existing)
  ),
  'content.improveExisting': route(
    z.object({ contentId: z.number(), url: z.string() }),
    ({ contentId, url }) => {
      const c = getContent(contentId)
      const id = startRefresh(c.siteId, url, c.notes ?? undefined)
      deleteContent(contentId)
      return id
    }
  ),
  'content.saveBrief': route(
    z.object({
      contentId: z.number(),
      outline: z.array(
        z.object({
          heading: z.string().min(1),
          level: z.number().int().min(2).max(3),
          key_points: z.array(z.string())
        })
      ),
      facts: z.record(z.string(), z.string()),
      cta: z.string().optional(),
      h1: z.string().optional()
    }),
    ({ contentId, outline, facts, cta, h1 }) => {
      const c = getContent(contentId)
      const brief = {
        ...(c.brief ?? {}),
        outline,
        ...(cta !== undefined ? { cta } : {}),
        ...(h1 ? { h1 } : {})
      }
      updateContent(contentId, { brief, facts, ...(h1 ? { title: h1 } : {}) })
    }
  ),
  'content.write': route(idInput, ({ id }) => {
    const c = getContent(id)
    if (!c.brief) throw new UserError('Create the brief first.')
    finishWaiting(id)
    updateContent(id, { status: 'Writing', bodyHtml: '' })
    enqueue({ type: 'write', siteId: c.siteId, contentId: id })
  }),
  'content.redoBrief': route(idInput, ({ id }) => {
    const c = getContent(id)
    finishWaiting(id)
    enqueue({ type: 'brief', siteId: c.siteId, contentId: id })
  }),
  'content.update': route(
    z.object({ id: z.number(), patch: metaPatch, versionNote: z.string().optional() }),
    ({ id, patch, versionNote }) => {
      updateContent(id, patch, versionNote)
      scoreContent(id)
      return full(id)
    }
  ),
  'content.score': route(idInput, ({ id }) => scoreContent(id)),
  'content.runChecks': route(idInput, ({ id }) => {
    const c = getContent(id)
    enqueue({ type: 'check', siteId: c.siteId, contentId: id })
  }),
  'content.fixCheck': route(z.object({ id: z.number(), checkId: z.string() }), async ({ id, checkId }) => {
    await fixCheck(id, checkId)
    return full(id)
  }),
  'content.rewrite': route(
    z.object({ id: z.number(), text: z.string().min(1), instruction: z.string() }),
    ({ id, text, instruction }) => rewriteSelection(id, text, instruction)
  ),
  'content.regenerateSection': route(
    z.object({ id: z.number(), sectionHtml: z.string().min(1), instruction: z.string() }),
    ({ id, sectionHtml, instruction }) => regenerateSection(id, sectionHtml, instruction)
  ),
  'content.applySuggestion': route(
    z.object({ id: z.number(), index: z.number(), accept: z.boolean() }),
    ({ id, index, accept }) => {
      applySuggestion(id, index, accept)
      return full(id)
    }
  ),
  'content.applyLinks': route(
    z.object({ id: z.number(), urls: z.array(z.string()).optional() }),
    ({ id, urls }) => {
      const n = insertSuggestedLinks(id, urls)
      scoreContent(id)
      return { added: n, content: full(id) }
    }
  ),
  'content.rejectLink': route(z.object({ id: z.number(), url: z.string() }), ({ id, url }) => {
    const c = getContent(id)
    const checks = (c.checks ?? {}) as { seoPass?: { internal_links: { url: string }[] } }
    if (checks.seoPass)
      checks.seoPass.internal_links = checks.seoPass.internal_links.filter((l) => l.url !== url)
    updateContent(id, { checks: checks as Record<string, unknown> })
    return full(id)
  }),
  'content.dismissConfirms': route(
    z.object({ id: z.number(), removeText: z.boolean() }),
    ({ id, removeText }) => {
      dismissConfirms(id, removeText)
      return full(id)
    }
  ),
  'content.tickClaim': route(
    z.object({ id: z.number(), index: z.number(), ticked: z.boolean() }),
    ({ id, index, ticked }) => {
      const c = getContent(id)
      const checks = (c.checks ?? {}) as { factCheck?: { ticked?: number[] } }
      if (checks.factCheck) {
        const s = new Set(checks.factCheck.ticked ?? [])
        if (ticked) s.add(index)
        else s.delete(index)
        checks.factCheck.ticked = [...s]
      }
      updateContent(id, { checks: checks as Record<string, unknown> })
      return full(id)
    }
  ),
  'content.setChecklist': route(
    z.object({ id: z.number(), items: z.array(z.boolean()).length(5) }),
    ({ id, items }) => {
      updateContent(id, { reviewChecklist: items })
      return full(id)
    }
  ),
  'content.versions': route(idInput, ({ id }) => listVersions(id)),
  'content.restoreVersion': route(
    z.object({ id: z.number(), versionId: z.number() }),
    ({ id, versionId }) => {
      restoreVersion(id, versionId)
      scoreContent(id)
      return full(id)
    }
  ),
  'content.delete': route(idInput, ({ id }) => deleteContent(id)),
  'content.setStatus': route(
    z.object({ id: z.number(), status: z.enum(['Idea', 'Needs refresh', 'Ready for review']) }),
    ({ id, status }) => {
      updateContent(id, { status })
    }
  ),
  'content.sendToWordPress': route(
    z.object({ id: z.number(), force: z.boolean().optional() }),
    ({ id, force }) => sendToWordPress(id, { force })
  ),
  'content.export': route(
    z.object({ id: z.number(), format: z.enum(EXPORT_FORMATS).optional(), folder: z.boolean().optional() }),
    async ({ id, format, folder }) => {
      const c = getContent(id)
      if (folder) {
        const [dir] = await rt().openDialog({ title: 'Choose a folder to export into', folder: true })
        if (!dir) return null
        return exportFolder(id, dir, format as ExportFormat | undefined)
      }
      const dest = await rt().saveDialog({
        title: 'Save export',
        defaultPath: `${c.slug || `content-${id}`}.zip`,
        filters: [{ name: 'Zip', extensions: ['zip'] }]
      })
      if (!dest) return null
      return exportZip(id, dest, format as ExportFormat | undefined)
    }
  ),
  'content.copyFormats': route(idInput, ({ id }) => {
    const c = getContent(id)
    const imgs = imagesFor(id).filter((i) => i.selected)
    const html = localizeImages(
      c.bodyHtml ?? '',
      imgs.map((i) => ({ ...i, filename: i.wpUrl ?? i.filename })),
      ''
    )
    return {
      html: `<h1>${c.title ?? ''}</h1>\n${html}`,
      markdown: `# ${c.title ?? ''}\n\n${htmlToMarkdown(html)}`
    }
  }),
  'content.exportPreview': route(
    z.object({ id: z.number(), format: z.enum(EXPORT_FORMATS).optional() }),
    ({ id, format }) => buildExportFiles(id, format as ExportFormat | undefined).files.map((f) => f.path)
  ),
  'content.markPublished': route(z.object({ id: z.number(), url: z.string() }), ({ id, url }) =>
    markPublished(id, url)
  ),
  'content.indexing': route(idInput, ({ id }) => {
    const c = getContent(id)
    const st = settingsOf(getSite(c.siteId))
    return {
      liveUrl: c.liveUrl,
      indexStatus: c.indexStatus,
      indexCheckedAt: c.indexCheckedAt,
      gsc: Boolean(st.gscProperty && gscConnected()),
      inspectUrl: c.liveUrl && st.gscProperty ? inspectionUiUrl(st.gscProperty, c.liveUrl) : null,
      indexNow: st.indexNowEnabled !== false && Boolean(st.indexNowKey)
    }
  }),
  'content.resubmit': route(idInput, async ({ id }) => {
    const c = getContent(id)
    if (!c.liveUrl) throw new UserError('Mark the piece as published with its live address first.')
    return requestIndexing(getSite(c.siteId), [c.liveUrl])
  }),
  'content.linkBacks': route(idInput, ({ id }) => {
    const c = getContent(id)
    return enqueue({ type: 'link-backs', siteId: c.siteId, contentId: id })
  }),
  'content.setModelOverrides': route(
    z.object({ id: z.number(), overrides: z.record(z.string(), modelRef) }),
    ({ id, overrides }) => {
      updateContent(id, { modelOverrides: overrides })
    }
  )
}

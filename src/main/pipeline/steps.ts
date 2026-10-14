import { eq } from 'drizzle-orm'
import { getDb, schema } from '../db'
import { runChat, type TaskContext, type ModelRef } from '../ai'
import { prompt } from '../prompts'
import { getSite, profileOf, systemPrompt, settingsOf, logActivity } from '../sites'
import {
  getContent,
  updateContent,
  setStatus,
  existingPages,
  pillarUrlFor,
  scoreContent,
  saveVersion,
  type ContentRow
} from '../content'
import { gatherResearch, sitePagesSummary } from '../research/gather'
import {
  ResearchSchema,
  BriefSchema,
  MetaSchema,
  SeoPassSchema,
  FactCheckSchema,
  AltKeywordsSchema,
  MetaFixSchema,
  type Research,
  type Brief
} from './schemas'
import { findConflicts, normalizeUrl } from './seo-checks'
import { normalize } from './text'
import { analyze, CONFIRM_RE } from './html'
import { cleanHtml } from './sanitize'
import { buildSchema } from './schema-jsonld'
import { checkLinks } from './links'
import { notifyUser } from '../notify'
import { UserError } from '../errors'
import type { JobCtx, JobResult } from '../jobs/types'
import { LENGTHS, type LengthKey } from '@shared/types'

export const YMYL_RE =
  /\b(dental|dentist|implant|medical|medicine|health|doctor|surgery|therapy|drug|legal|law(?:yer)?|attorney|lawsuit|divorce|injury|tax|loan|mortgage|insurance|invest|finance|financial|credit|debt|pension|retirement|bankruptcy)\b/i

function taskCtx(
  ctx: JobCtx | { signal?: AbortSignal; budgetOverride?: boolean },
  c: ContentRow,
  task?: string
): TaskContext {
  const overrides = c.modelOverrides ?? {}
  return {
    siteId: c.siteId,
    contentId: c.id,
    signal: ctx.signal,
    budgetOverride: ctx.budgetOverride,
    override: (task && overrides[task]) || null
  }
}

/* ------------------------------------------------------------------ research */

export function postProcessResearch(
  r: Research,
  data: { keywordData: { keyword: string; volume: number | null }[]; gscQueries: { query: string }[] },
  siteId: number,
  contentId: number
): Research {
  const vol = new Map(data.keywordData.map((k) => [normalize(k.keyword), k.volume]))
  const gsc = new Set(data.gscQueries.map((q) => normalize(q.query)))
  const pages = existingPages(siteId, contentId)
  r.keyword_options = r.keyword_options.map((k) => {
    const real = vol.get(normalize(k.keyword))
    // The AI must never invent numbers: only data-source volumes survive.
    let volume: number | null = null
    let volume_source: 'gsc' | 'dataforseo' | 'ai_estimate' = 'ai_estimate'
    if (real !== undefined && real !== null) {
      volume = real
      volume_source = 'dataforseo'
    } else if (gsc.has(normalize(k.keyword))) volume_source = 'gsc'
    const conflict = findConflicts(k.keyword, '', pages)[0]
    return { ...k, volume, volume_source, cannibalization_risk: conflict ? conflict.url : null }
  })
  return r
}

export async function stepResearch(ctx: JobCtx): Promise<JobResult> {
  const c = getContent(ctx.contentId!)
  const site = getSite(c.siteId)
  setStatus(c.id, 'Researching')
  const topic = c.topic || c.focusKeyword || c.title || ''
  if (!topic) throw new UserError('Type a topic, product or service to research.')
  const data = await gatherResearch(site, topic, ctx.signal, (s) => ctx.progress('research', s))
  ctx.progress('research', 'AI is researching keywords and competitors')
  const r = await runChat(
    {
      task: 'research',
      system: systemPrompt(site),
      prompt: prompt('research', {
        topic,
        site_pages: data.sitePages,
        gsc_queries: data.gscQueries.length ? data.gscQueries : '',
        keyword_data: data.keywordData.length ? data.keywordData : '',
        serp_results: data.serpResults.length ? data.serpResults : '',
        autocomplete: data.autocomplete,
        web_search: true,
        notes: c.notes || '(nothing)'
      }),
      schema: ResearchSchema,
      webSearch: true,
      maxOutputTokens: 8000
    },
    taskCtx(ctx, c, 'research')
  )
  const research = postProcessResearch(r.data, data, c.siteId, c.id)
  const sources = [
    ...new Set([...research.sources, ...r.citations.map((x) => x.url), ...data.serpResults.map((s) => s.url)])
  ]
  research.sources = sources
  updateContent(c.id, {
    research: {
      ...research,
      data_sources: data.sourcesUsed,
      serp: data.serpResults,
      model: r.model
    } as unknown as Record<string, unknown>,
    status: 'Awaiting choice'
  })
  logActivity(c.siteId, `Research ready for "${topic}"`, `/content/${c.id}`)
  return { status: 'waiting_for_user', step: 'choose' }
}

/* ------------------------------------------------------------------ choose */

export interface ChoiceInput {
  contentId: number
  keyword: string
  contentType: string
  length: LengthKey
  notes?: string
  force?: boolean
  modelOverrides?: Record<string, ModelRef>
}

/** Owner picks keyword/type/length. Returns cannibalization conflicts unless forced. */
export function applyChoice(i: ChoiceInput): { conflicts: { url: string; title?: string | null }[] } {
  const c = getContent(i.contentId)
  const conflicts = findConflicts(i.keyword, '', existingPages(c.siteId, c.id), c.refreshOfUrl)
  if (conflicts.length && !i.force)
    return { conflicts: conflicts.map((p) => ({ url: p.url, title: p.title })) }
  updateContent(c.id, {
    focusKeyword: i.keyword.trim(),
    type: i.contentType,
    targetWords: LENGTHS[i.length]?.words || null,
    notes: [c.notes, i.notes].filter(Boolean).join('\n'),
    modelOverrides: i.modelOverrides ?? c.modelOverrides
  })
  return { conflicts: [] }
}

export async function suggestAltKeywords(contentId: number, keyword: string, existing: string) {
  const c = getContent(contentId)
  const site = getSite(c.siteId)
  const r = await runChat(
    {
      task: 'quick',
      system: systemPrompt(site),
      prompt: prompt('alt-keywords', { keyword, existing }),
      schema: AltKeywordsSchema
    },
    { siteId: c.siteId, contentId }
  )
  return r.data.keywords
}

/* ------------------------------------------------------------------ brief */

export async function stepBrief(ctx: JobCtx): Promise<JobResult> {
  const c = getContent(ctx.contentId!)
  const site = getSite(c.siteId)
  ctx.progress('brief', 'Writing the content brief')
  const research = (c.research ?? {}) as Partial<Research>
  const pillar = pillarUrlFor(c)
  const r = await runChat(
    {
      task: 'research',
      system: systemPrompt(site),
      prompt: prompt('brief', {
        content_type: c.type,
        business_name: profileOf(site).name,
        keyword: c.focusKeyword,
        target_words: c.targetWords || 'whatever the topic needs',
        research: {
          competitor_snapshot: research.competitor_snapshot,
          content_gap: research.content_gap,
          questions: research.questions,
          recommendation: research.recommendation
        },
        notes: c.notes || '(none)',
        site_pages: sitePagesSummary(c.siteId, 120),
        pillar: pillar ?? ''
      }),
      schema: BriefSchema,
      maxOutputTokens: 6000
    },
    taskCtx(ctx, c, 'research')
  )
  const brief = r.data
  // only keep internal links to pages that exist
  const known = new Set(
    getDb()
      .select()
      .from(schema.pages)
      .where(eq(schema.pages.siteId, c.siteId))
      .all()
      .map((p) => normalizeUrl(p.url))
  )
  brief.internal_links = brief.internal_links.filter((l) => known.has(normalizeUrl(l.url)))
  if (pillar && !brief.internal_links.some((l) => normalizeUrl(l.url) === normalizeUrl(pillar)))
    brief.internal_links.unshift({ url: pillar, anchor: brief.h1 })
  updateContent(c.id, {
    brief: brief as unknown as Record<string, unknown>,
    title: c.title || brief.h1,
    secondaryKeywords: brief.secondary_keywords,
    status: 'Awaiting choice'
  })
  return { status: 'waiting_for_user', step: 'brief' }
}

/* ------------------------------------------------------------------ write */

interface Section {
  heading: string
  level: number
  key_points: string[]
  children: { heading: string; level: number; key_points: string[] }[]
}

export function groupOutline(outline: Brief['outline']): Section[] {
  const out: Section[] = []
  for (const o of outline) {
    if (o.level <= 2 || !out.length)
      out.push({ heading: o.heading, level: 2, key_points: o.key_points, children: [] })
    else out[out.length - 1].children.push({ heading: o.heading, level: 3, key_points: o.key_points })
  }
  return out
}

export async function stepWrite(ctx: JobCtx): Promise<JobResult> {
  const c = getContent(ctx.contentId!)
  const site = getSite(c.siteId)
  const p = profileOf(site)
  const brief = c.brief as unknown as Brief | null
  if (!brief) throw new UserError('This piece has no brief yet. Go back to the brief step and create one.')
  setStatus(c.id, 'Writing')
  const facts = (c.facts ?? {}) as Record<string, string>
  const ownerFacts = brief.facts_needed
    .map((f) =>
      facts[f.key]?.trim()
        ? `${f.question} ${facts[f.key].trim()}`
        : `${f.question} (not answered: write [CONFIRM: ${f.question}] where needed)`
    )
    .join('\n')
  const sections = groupOutline(brief.outline)
  const steps: { label: string; instruction: string }[] = [
    {
      label: 'Introduction',
      instruction:
        'Now write ONLY the introduction (2 short paragraphs, no heading). Use the focus keyword in the first sentence or two.'
    },
    ...sections.map((s) => ({
      label: s.heading,
      instruction: `Now write ONLY this section: ## ${s.heading}\nKey points: ${s.key_points.join('; ')}${
        s.children.length
          ? `\nInclude these H3 subsections:\n${s.children.map((ch) => `### ${ch.heading} (${ch.key_points.join('; ')})`).join('\n')}`
          : ''
      }\nStart with <h2>${s.heading}</h2>. Target about ${c.targetWords ? Math.round((c.targetWords * 0.9) / Math.max(1, sections.length)) : 250} words.`
    }))
  ]
  if (!sections.some((s) => /call|contact|get started|book|quote|ready/i.test(s.heading)))
    steps.push({
      label: 'Call to action',
      instruction: `Now write ONLY the closing call to action: a short H2 and one paragraph. Use this call to action: ${brief.cta}`
    })

  const done = Number(ctx.output.sectionsDone ?? 0)
  let body = done > 0 ? (c.bodyHtml ?? '') : ''
  const voice = (site.voiceSamples ?? []).map((s) => s.slice(0, 1500))
  for (let i = done; i < steps.length; i++) {
    ctx.progress('write', `Writing: ${steps[i].label} (${i + 1} of ${steps.length})`)
    const r = await runChat(
      {
        task: 'writing',
        system: systemPrompt(site),
        prompt: prompt('write', {
          content_type: c.type,
          business_name: p.name,
          keyword: c.focusKeyword,
          secondary_keywords: c.secondaryKeywords ?? brief.secondary_keywords,
          target_words: c.targetWords || 'as long as the topic needs',
          brief: {
            h1: brief.h1,
            angle: brief.angle,
            audience: brief.audience,
            outline: brief.outline,
            questions: brief.questions,
            internal_links: brief.internal_links
          },
          owner_facts: ownerFacts || '(none)',
          voice_samples: voice.length ? voice.join('\n---\n') : '(none)',
          cta: brief.cta || p.callToAction,
          written_so_far: body
            ? analyze(body)
                .headings.map((h) => h.text)
                .join(' | ')
            : '(nothing yet)',
          section_instruction: steps[i].instruction
        }),
        maxOutputTokens: 4000,
        temperature: 0.7,
        onToken: (t) => ctx.token(t)
      },
      taskCtx(ctx, c, 'writing')
    )
    body += '\n' + cleanHtml(r.text)
    updateContent(c.id, { bodyHtml: body.trim() })
    ctx.save({ sectionsDone: i + 1 })
  }
  saveVersion(c.id, 'First draft')
  await runChecks(ctx)
  return { status: 'done' }
}

/* ------------------------------------------------------------------ checks */

export async function generateMeta(c: ContentRow, ctx: TaskContext) {
  const site = getSite(c.siteId)
  const r = await runChat(
    {
      task: 'quick',
      system: systemPrompt(site),
      prompt: prompt('meta', {
        content_type: c.type,
        keyword: c.focusKeyword,
        title: c.title,
        draft: analyze(c.bodyHtml ?? '').text.slice(0, 3000),
        categories: settingsOf(site).defaultCategories ?? []
      }),
      schema: MetaSchema
    },
    ctx
  )
  return r.data
}

export function rebuildSchema(id: number): void {
  const c = getContent(id)
  const site = getSite(c.siteId)
  const featured = getDb()
    .select()
    .from(schema.images)
    .where(eq(schema.images.contentId, id))
    .all()
    .find((im) => im.slot === 'featured' && im.selected)
  updateContent(id, {
    schema: buildSchema({
      type: c.type,
      title: c.title ?? '',
      description: c.metaDescription,
      url: c.liveUrl || `${site.url}/${c.slug ?? ''}`,
      html: c.bodyHtml ?? '',
      profile: profileOf(site),
      siteUrl: site.url,
      image: featured?.wpUrl ?? null,
      datePublished: c.publishedAt ? new Date(c.publishedAt).toISOString() : null,
      keyword: c.focusKeyword
    })
  })
}

/** SEO pass + quality and fact checks. Ends at "Ready for review". */
export async function runChecks(
  ctx:
    | JobCtx
    | { signal?: AbortSignal; contentId: number; progress?: JobCtx['progress']; budgetOverride?: boolean }
): Promise<void> {
  const id = ctx.contentId!
  let c = getContent(id)
  const site = getSite(c.siteId)
  const progress = (s: string) => ('progress' in ctx && ctx.progress ? ctx.progress('check', s) : undefined)
  setStatus(id, 'Checking')

  if (!c.seoTitle || !c.metaDescription || !c.slug) {
    progress('Writing SEO title, meta description and slug')
    const m = await generateMeta(c, taskCtx(ctx, c, 'quick'))
    updateContent(id, {
      seoTitle: c.seoTitle || m.seo_title,
      metaDescription: c.metaDescription || m.meta_description,
      slug: c.slug || m.slug,
      excerpt: c.excerpt || m.excerpt,
      categories: c.categories?.length ? c.categories : m.categories,
      tags: c.tags?.length ? c.tags : m.tags
    })
  }
  rebuildSchema(id)
  progress('Running the SEO checklist')
  const scored = scoreContent(id)
  c = getContent(id)

  progress('AI SEO pass: flow, keywords and internal links')
  const failing = scored.checks.filter((x) => x.state !== 'pass').map((x) => `${x.label}: ${x.detail}`)
  const pillar = pillarUrlFor(c)
  const seoPass = await runChat(
    {
      task: 'seo',
      system: systemPrompt(site),
      prompt: prompt('seo-pass', {
        business_name: profileOf(site).name,
        keyword: c.focusKeyword,
        secondary_keywords: c.secondaryKeywords ?? [],
        check_summary: failing.length ? failing.join('\n') : 'All checks pass.',
        site_pages: sitePagesSummary(c.siteId, 120, true),
        pillar: pillar ?? '',
        draft: c.bodyHtml
      }),
      schema: SeoPassSchema,
      maxOutputTokens: 4000
    },
    taskCtx(ctx, c, 'seo')
  )
  const known = new Set(
    getDb()
      .select()
      .from(schema.pages)
      .where(eq(schema.pages.siteId, c.siteId))
      .all()
      .map((p) => normalizeUrl(p.url))
  )
  const sp = seoPass.data
  sp.internal_links = sp.internal_links.filter(
    (l) => known.has(normalizeUrl(l.url)) || (pillar && normalizeUrl(l.url) === normalizeUrl(pillar))
  )
  sp.link_backs = sp.link_backs.filter((l) => known.has(normalizeUrl(l.from_url)))
  sp.suggestions = sp.suggestions.filter((s) => s.find && (c.bodyHtml ?? '').includes(s.find))

  progress('Fact-checking with a second model')
  const fc = await runChat(
    {
      task: 'factcheck',
      system: systemPrompt(site),
      prompt: prompt('fact-check', {
        draft: c.bodyHtml,
        must_not_say: profileOf(site).mustNotSay || '(nothing listed)'
      }),
      schema: FactCheckSchema,
      webSearch: true,
      maxOutputTokens: 6000
    },
    taskCtx(ctx, c, 'factcheck')
  )
  const ymyl = fc.data.ymyl || YMYL_RE.test(`${c.focusKeyword} ${c.title} ${c.topic}`)

  progress('Checking every link works')
  const links = await checkLinks(c.bodyHtml ?? '', site.url, ctx.signal)

  const prev = (c.checks ?? {}) as Record<string, unknown>
  updateContent(id, {
    checks: {
      ...prev,
      seoPass: { ...sp, decided: {} },
      factCheck: { ...fc.data, citations: fc.citations, ticked: [] },
      ymyl,
      links,
      checkedAt: Date.now()
    },
    status: 'Ready for review'
  })
  scoreContent(id)
  c = getContent(id)
  notifyUser(
    c.siteId,
    'ready',
    `Ready for review: ${c.title}`,
    'Open it in the Content Editor to review and approve.',
    `/content/${id}`
  )
}

/* ------------------------------------------------------------------ editor AI actions */

const META_CHECKS = new Set(['kw_title', 'title_len', 'meta_len', 'slug'])

/** "Fix it" for one failing SEO check: asks the AI to fix only that item. */
export async function fixCheck(
  contentId: number,
  checkId: string,
  signal?: AbortSignal
): Promise<ContentRow> {
  const c = getContent(contentId)
  const site = getSite(c.siteId)
  const check = (
    (c.checks as { seo?: { id: string; label: string; detail: string }[] } | null)?.seo ?? []
  ).find((x) => x.id === checkId)
  const problem = check ? `${check.label}: ${check.detail}` : checkId
  const ctx = { siteId: c.siteId, contentId, signal }
  if (checkId === 'schema') {
    rebuildSchema(contentId)
  } else if (META_CHECKS.has(checkId)) {
    const r = await runChat(
      {
        task: 'quick',
        system: systemPrompt(site),
        prompt: prompt('meta-fix', {
          problem,
          keyword: c.focusKeyword,
          seo_title: c.seoTitle,
          meta_description: c.metaDescription,
          slug: c.slug
        }),
        schema: MetaFixSchema
      },
      ctx
    )
    updateContent(
      contentId,
      { seoTitle: r.data.seo_title, metaDescription: r.data.meta_description, slug: r.data.slug },
      `Fix: ${check?.label ?? checkId}`
    )
  } else if (checkId === 'internal_links' && insertSuggestedLinks(contentId) > 0) {
    // applied the AI SEO pass's internal link suggestions
  } else {
    const r = await runChat(
      {
        task: 'seo',
        system: systemPrompt(site),
        prompt: prompt('fix-it', { problem, keyword: c.focusKeyword, draft: c.bodyHtml }),
        maxOutputTokens: 12000
      },
      ctx
    )
    const html = cleanHtml(r.text)
    if (analyze(html).wordCount < analyze(c.bodyHtml ?? '').wordCount * 0.5)
      throw new UserError(
        "The AI's fix removed too much of the article, so it wasn't applied. Try again, or fix this one by hand."
      )
    updateContent(contentId, { bodyHtml: html }, `Fix: ${check?.label ?? checkId}`)
  }
  scoreContent(contentId)
  return getContent(contentId)
}

/** Insert an <a> around the first unlinked occurrence of anchor text. */
export function insertLink(html: string, anchor: string, url: string): string | null {
  if (!anchor.trim()) return null
  const esc = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(>[^<]*?)\\b(${esc})\\b`, 'i')
  // avoid text already inside a link
  const parts = html.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/i)
  for (let i = 0; i < parts.length; i += 2) {
    const seg = `>${parts[i]}`
    if (re.test(seg)) {
      parts[i] = seg.replace(re, `$1<a href="${url}">$2</a>`).slice(1)
      return parts.join('')
    }
  }
  return null
}

export function insertSuggestedLinks(contentId: number, only?: string[]): number {
  const c = getContent(contentId)
  const sp = (c.checks as { seoPass?: { internal_links: { url: string; anchor: string }[] } } | null)?.seoPass
  let html = c.bodyHtml ?? ''
  let n = 0
  for (const l of sp?.internal_links ?? []) {
    if (only && !only.includes(l.url)) continue
    if (html.includes(`href="${l.url}"`)) continue
    const next = insertLink(html, l.anchor, l.url)
    if (next) {
      html = next
      n++
    }
  }
  if (n) updateContent(contentId, { bodyHtml: html }, `Added ${n} internal link${n === 1 ? '' : 's'}`)
  return n
}

export async function rewriteSelection(
  contentId: number,
  text: string,
  instruction: string,
  signal?: AbortSignal
): Promise<string> {
  const c = getContent(contentId)
  const site = getSite(c.siteId)
  const r = await runChat(
    {
      task: 'writing',
      system: systemPrompt(site),
      prompt: prompt('rewrite', {
        instruction: instruction || 'Make it clearer and more natural.',
        keyword: c.focusKeyword,
        text
      }),
      maxOutputTokens: 3000
    },
    { siteId: c.siteId, contentId, signal }
  )
  return cleanHtml(r.text)
}

export async function regenerateSection(
  contentId: number,
  sectionHtml: string,
  instruction: string,
  signal?: AbortSignal
): Promise<string> {
  const c = getContent(contentId)
  const site = getSite(c.siteId)
  const r = await runChat(
    {
      task: 'writing',
      system: systemPrompt(site),
      prompt: prompt('regenerate-section', {
        content_type: c.type,
        business_name: profileOf(site).name,
        keyword: c.focusKeyword,
        instruction: instruction || '(none)',
        context: analyze(c.bodyHtml ?? '')
          .headings.map((h) => h.text)
          .join(' | '),
        section: sectionHtml
      }),
      maxOutputTokens: 4000
    },
    { siteId: c.siteId, contentId, signal }
  )
  return cleanHtml(r.text)
}

/** Accept one AI SEO-pass suggestion (find -> replace). */
export function applySuggestion(contentId: number, index: number, accept: boolean): ContentRow {
  const c = getContent(contentId)
  const checks = (c.checks ?? {}) as {
    seoPass?: { suggestions: { find: string; replace: string }[]; decided?: Record<string, string> }
  }
  const sp = checks.seoPass
  if (!sp?.suggestions[index]) throw new UserError('That suggestion is no longer available.')
  const s = sp.suggestions[index]
  sp.decided = { ...(sp.decided ?? {}), [index]: accept ? 'accepted' : 'rejected' }
  const patch: Partial<typeof schema.content.$inferInsert> = { checks: checks as Record<string, unknown> }
  if (accept) {
    if (!(c.bodyHtml ?? '').includes(s.find))
      throw new UserError(
        "That text isn't in the draft any more (it may have been edited), so the suggestion can't be applied."
      )
    patch.bodyHtml = (c.bodyHtml ?? '').replace(s.find, s.replace)
  }
  updateContent(contentId, patch, accept ? 'Accepted SEO suggestion' : undefined)
  scoreContent(contentId)
  return getContent(contentId)
}

/** Dismiss all remaining [CONFIRM] placeholders (owner explicitly chose to). */
export function dismissConfirms(contentId: number, removeText: boolean): ContentRow {
  const c = getContent(contentId)
  const checks = { ...((c.checks ?? {}) as Record<string, unknown>), confirmsDismissed: true }
  const patch: Partial<typeof schema.content.$inferInsert> = { checks }
  if (removeText) patch.bodyHtml = (c.bodyHtml ?? '').replace(CONFIRM_RE, '')
  updateContent(contentId, patch, 'Dismissed [CONFIRM] placeholders')
  scoreContent(contentId)
  return getContent(contentId)
}

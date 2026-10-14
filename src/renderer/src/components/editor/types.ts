import type { RouteOutput } from '@/lib/api'

/** The full content record the editor works with (content.get / content.update / ...). */
export type ContentView = RouteOutput<'content.get'>
export type ImageView = ContentView['images'][number]
export type VersionView = RouteOutput<'content.versions'>[number]

export type CheckState = 'pass' | 'warn' | 'fail'

export interface SeoCheck {
  id: string
  label: string
  state: CheckState
  detail: string
  fixable: boolean
}

export interface SeoSuggestion {
  find: string
  replace: string
  reason: string
}
export interface InternalLinkSuggestion {
  url: string
  anchor: string
  placement_hint: string
}
export interface LinkBack {
  from_url: string
  anchor: string
  reason: string
}
export interface BacklinkIdea {
  idea: string
  why: string
}
export interface SeoPass {
  suggestions: SeoSuggestion[]
  internal_links: InternalLinkSuggestion[]
  link_backs: LinkBack[]
  backlink_ideas: BacklinkIdea[]
  decided: Record<string, string>
}

export interface Claim {
  sentence: string
  why: string
  suggested_source: string
}
export interface FactCheck {
  claims: Claim[]
  brand_safety: { sentence: string; conflict: string }[]
  robotic: { passage: string; rewrite: string }[]
  citations: { url: string; title?: string }[]
  ticked: number[]
}

export interface LinkCheck {
  href: string
  ok: boolean
  status: number | null
  note: string
}

export interface Checks {
  seo: SeoCheck[]
  seoPass: SeoPass | null
  factCheck: FactCheck | null
  links: LinkCheck[] | null
  checkedAt: number | null
}

/* ------------------------------------------------ narrowing helpers for loosely typed JSON */

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const objs = (v: unknown): Obj[] => arr(v).filter(isObj)

export function readChecks(raw: unknown): Checks {
  const c = isObj(raw) ? raw : {}
  const seo: SeoCheck[] = objs(c.seo).map((x) => ({
    id: str(x.id),
    label: str(x.label),
    state: x.state === 'pass' || x.state === 'warn' || x.state === 'fail' ? x.state : 'warn',
    detail: str(x.detail),
    fixable: Boolean(x.fixable)
  }))
  let seoPass: SeoPass | null = null
  if (isObj(c.seoPass)) {
    const sp = c.seoPass
    const decided: Record<string, string> = {}
    if (isObj(sp.decided)) for (const [k, v] of Object.entries(sp.decided)) decided[k] = str(v)
    seoPass = {
      suggestions: objs(sp.suggestions).map((x) => ({
        find: str(x.find),
        replace: str(x.replace),
        reason: str(x.reason)
      })),
      internal_links: objs(sp.internal_links).map((x) => ({
        url: str(x.url),
        anchor: str(x.anchor),
        placement_hint: str(x.placement_hint)
      })),
      link_backs: objs(sp.link_backs).map((x) => ({
        from_url: str(x.from_url),
        anchor: str(x.anchor),
        reason: str(x.reason)
      })),
      backlink_ideas: objs(sp.backlink_ideas).map((x) => ({ idea: str(x.idea), why: str(x.why) })),
      decided
    }
  }
  let factCheck: FactCheck | null = null
  if (isObj(c.factCheck)) {
    const fc = c.factCheck
    factCheck = {
      claims: objs(fc.claims).map((x) => ({
        sentence: str(x.sentence),
        why: str(x.why),
        suggested_source: str(x.suggested_source)
      })),
      brand_safety: objs(fc.brand_safety).map((x) => ({
        sentence: str(x.sentence),
        conflict: str(x.conflict)
      })),
      robotic: objs(fc.robotic).map((x) => ({ passage: str(x.passage), rewrite: str(x.rewrite) })),
      citations: objs(fc.citations).map((x) => ({
        url: str(x.url),
        title: typeof x.title === 'string' ? x.title : undefined
      })),
      ticked: arr(fc.ticked).filter((n): n is number => typeof n === 'number')
    }
  }
  const links = Array.isArray(c.links)
    ? objs(c.links).map((x) => ({
        href: str(x.href),
        ok: Boolean(x.ok),
        status: typeof x.status === 'number' ? x.status : null,
        note: str(x.note)
      }))
    : null
  return { seo, seoPass, factCheck, links, checkedAt: typeof c.checkedAt === 'number' ? c.checkedAt : null }
}

export interface Improvement {
  change: string
  why: string
}

export function readResearch(raw: unknown): { sources: string[]; improvements: Improvement[] } {
  const r = isObj(raw) ? raw : {}
  return {
    sources: arr(r.sources).filter((s): s is string => typeof s === 'string'),
    improvements: objs(r.improvements).map((x) => ({ change: str(x.change), why: str(x.why) }))
  }
}

export const mediaSrc = (id: number) => `autbot-media://img/${id}`

export const REVIEW_ITEMS = [
  'Everything in it is true (prices, warranties, specs, claims).',
  'It sounds like our business.',
  'A customer would actually find it useful.',
  'Links work and the page looks right.',
  "It targets a keyword we don't already have a page for."
] as const

export type RightTab = 'seo' | 'meta' | 'links' | 'images' | 'schema' | 'checks' | 'history'
export const RIGHT_TABS: { id: RightTab; label: string }[] = [
  { id: 'seo', label: 'SEO' },
  { id: 'meta', label: 'Meta' },
  { id: 'links', label: 'Links' },
  { id: 'images', label: 'Images' },
  { id: 'schema', label: 'Schema' },
  { id: 'checks', label: 'Checks' },
  { id: 'history', label: 'History' }
]
export const isRightTab = (s: string | null): s is RightTab => RIGHT_TABS.some((t) => t.id === s)

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

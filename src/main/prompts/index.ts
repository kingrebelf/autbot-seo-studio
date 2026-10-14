import { eq } from 'drizzle-orm'
import { getDb, schema } from '../db'

const files = import.meta.glob('./*.md', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

export const DEFAULT_PROMPTS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([p, body]) => [p.replace(/^\.\//, '').replace(/\.md$/, ''), body.trim()])
)

export const PROMPT_LABELS: Record<string, string> = {
  'system-base': 'System (prepended to every task)',
  research: 'Research',
  brief: 'Content brief',
  write: 'Writing',
  meta: 'SEO title & meta',
  'seo-pass': 'SEO pass',
  'fact-check': 'Fact-check',
  'image-prompt': 'Image prompts',
  'image-text': 'Image text details',
  'mode-b': 'Mode B: what next',
  'mode-c': 'Mode C: maintenance',
  'mode-d': 'Mode D: refresh a page',
  'mode-e': 'Mode E: build a set',
  'mode-f': 'Mode F: local pages',
  calendar: 'Mode G: content calendar',
  spar: 'Spar with AI',
  'spar-conclude': 'Spar: save conclusion',
  'fix-it': 'Fix it (SEO check)',
  'meta-fix': 'Fix it (title/meta)',
  rewrite: 'Rewrite selection',
  'regenerate-section': 'Regenerate section',
  'alt-keywords': 'More specific keywords'
}

export function getTemplate(key: string): string {
  const row = getDb().select().from(schema.promptTemplates).where(eq(schema.promptTemplates.key, key)).get()
  if (row?.isCustom) return row.body
  const d = DEFAULT_PROMPTS[key]
  if (d === undefined) throw new Error(`Unknown prompt template ${key}`)
  return d
}

export function listTemplates() {
  const rows = getDb().select().from(schema.promptTemplates).all()
  return Object.keys(DEFAULT_PROMPTS)
    .sort()
    .map((key) => {
      const row = rows.find((r) => r.key === key)
      const body = row?.isCustom ? row.body : DEFAULT_PROMPTS[key]
      return {
        key,
        label: PROMPT_LABELS[key] ?? key,
        body,
        isCustom: Boolean(row?.isCustom),
        variables: variablesOf(DEFAULT_PROMPTS[key])
      }
    })
}

export function saveTemplate(key: string, body: string): void {
  if (!(key in DEFAULT_PROMPTS)) throw new Error(`Unknown prompt template ${key}`)
  getDb()
    .insert(schema.promptTemplates)
    .values({ key, body, isCustom: true })
    .onConflictDoUpdate({
      target: schema.promptTemplates.key,
      set: { body, isCustom: true, updatedAt: Date.now() }
    })
    .run()
}

export function resetTemplate(key: string): void {
  getDb().delete(schema.promptTemplates).where(eq(schema.promptTemplates.key, key)).run()
}

export function variablesOf(body: string): string[] {
  const out = new Set<string>()
  for (const m of body.matchAll(/\{\{\s*(?:#if\s+)?([a-z_]+)\s*\}\}/gi)) out.add(m[1])
  return [...out]
}

type Vars = Record<string, unknown>

function stringify(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v))
    return v.length ? (v.every((x) => typeof x === 'string') ? v.join(', ') : JSON.stringify(v)) : '(none)'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** Fill {{var}} and {{#if var}}...{{/if}} in a template. */
export function render(body: string, vars: Vars): string {
  let out = body.replace(
    /\{\{#if\s+([a-z_]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/gi,
    (_m, name: string, inner: string) => {
      const v = vars[name]
      const truthy = Array.isArray(v) ? v.length > 0 : Boolean(v)
      return truthy ? inner : ''
    }
  )
  out = out.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, name: string) => stringify(vars[name]))
  return out.trim()
}

export function prompt(key: string, vars: Vars): string {
  return render(getTemplate(key), vars)
}

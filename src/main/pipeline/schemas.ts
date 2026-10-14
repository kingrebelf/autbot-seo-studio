import { z } from 'zod'

/**
 * Structured outputs the AI must return. Every field is required (nullable where it may be
 * empty) so the same schema works with strict JSON modes on every provider.
 */
const named = <T extends z.ZodType>(title: string, s: T): T => s.meta({ title }) as T

export const ResearchSchema = named(
  'research',
  z.object({
    keyword_options: z.array(
      z.object({
        keyword: z.string(),
        intent: z.enum(['buy now', 'compare', 'learn', 'local']),
        difficulty_for_small_site: z.enum(['low', 'medium', 'high']),
        volume: z.number().nullable(),
        volume_source: z.enum(['gsc', 'dataforseo', 'ai_estimate']),
        why_it_fits: z.string(),
        cannibalization_risk: z.string().nullable()
      })
    ),
    competitor_snapshot: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        page_type: z.string(),
        approx_words: z.number().nullable(),
        covers: z.string(),
        misses: z.string()
      })
    ),
    content_gap: z.array(z.string()),
    questions: z.array(z.string()),
    recommendation: z.object({
      keyword: z.string(),
      content_type: z.string(),
      why: z.string(),
      worth_it: z.boolean()
    }),
    sources: z.array(z.string())
  })
)
export type Research = z.infer<typeof ResearchSchema>

export const BriefSchema = named(
  'brief',
  z.object({
    search_intent: z.string(),
    audience: z.string(),
    angle: z.string(),
    h1: z.string(),
    outline: z.array(z.object({ heading: z.string(), level: z.number(), key_points: z.array(z.string()) })),
    questions: z.array(z.string()),
    internal_links: z.array(z.object({ url: z.string(), anchor: z.string() })),
    cta: z.string(),
    facts_needed: z.array(z.object({ key: z.string(), question: z.string() })),
    secondary_keywords: z.array(z.string())
  })
)
export type Brief = z.infer<typeof BriefSchema>

export const MetaSchema = named(
  'meta',
  z.object({
    seo_title: z.string(),
    meta_description: z.string(),
    slug: z.string(),
    excerpt: z.string(),
    categories: z.array(z.string()),
    tags: z.array(z.string())
  })
)
export type MetaOut = z.infer<typeof MetaSchema>

export const SeoPassSchema = named(
  'seo_pass',
  z.object({
    suggestions: z.array(z.object({ find: z.string(), replace: z.string(), reason: z.string() })),
    internal_links: z.array(z.object({ url: z.string(), anchor: z.string(), placement_hint: z.string() })),
    link_backs: z.array(z.object({ from_url: z.string(), anchor: z.string(), reason: z.string() })),
    backlink_ideas: z.array(z.object({ idea: z.string(), why: z.string() }))
  })
)
export type SeoPass = z.infer<typeof SeoPassSchema>

export const FactCheckSchema = named(
  'fact_check',
  z.object({
    claims: z.array(z.object({ sentence: z.string(), why: z.string(), suggested_source: z.string() })),
    brand_safety: z.array(z.object({ sentence: z.string(), conflict: z.string() })),
    robotic: z.array(z.object({ passage: z.string(), rewrite: z.string() })),
    ymyl: z.boolean()
  })
)
export type FactCheck = z.infer<typeof FactCheckSchema>

export const ImagePromptsSchema = named(
  'image_prompts',
  z.object({ slots: z.array(z.object({ slot: z.string(), prompt: z.string() })) })
)

export const ImageTextSchema = named(
  'image_text',
  z.object({
    filename: z.string(),
    alt: z.string(),
    title: z.string(),
    caption: z.string(),
    description: z.string()
  })
)
export type ImageText = z.infer<typeof ImageTextSchema>

export const SuggestionsSchema = named(
  'mode_b',
  z.object({
    suggestions: z.array(
      z.object({
        title: z.string(),
        keyword: z.string(),
        content_type: z.string(),
        why: z.string(),
        priority: z.number()
      })
    )
  })
)
export type Suggestions = z.infer<typeof SuggestionsSchema>

export const MaintenanceSchema = named(
  'mode_c',
  z.object({
    suggestions: z.array(
      z.object({
        kind: z.enum(['refresh', 'supporting', 'title_meta', 'thin']),
        page_url: z.string().nullable(),
        title: z.string(),
        keyword: z.string(),
        why: z.string(),
        proposed_title: z.string().nullable(),
        proposed_meta: z.string().nullable()
      })
    )
  })
)
export type Maintenance = z.infer<typeof MaintenanceSchema>

export const RefreshSchema = named(
  'mode_d',
  z.object({
    improvements: z.array(z.object({ change: z.string(), why: z.string() })),
    focus_keyword: z.string(),
    title: z.string(),
    updated_html: z.string()
  })
)
export type Refresh = z.infer<typeof RefreshSchema>

export const ClusterSchema = named(
  'mode_e',
  z.object({
    pillar: z.object({ title: z.string(), keyword: z.string(), why: z.string() }),
    supporting: z.array(z.object({ title: z.string(), keyword: z.string(), why: z.string() }))
  })
)
export type Cluster = z.infer<typeof ClusterSchema>

export const LocalSchema = named(
  'mode_f',
  z.object({
    pages: z.array(
      z.object({ area: z.string(), title: z.string(), keyword: z.string(), local_angle: z.string() })
    )
  })
)
export type LocalPlan = z.infer<typeof LocalSchema>

export const CalendarSchema = named(
  'mode_g',
  z.object({
    months: z.array(
      z.object({
        month: z.string(),
        focus: z.string(),
        why_now: z.string(),
        main: z.object({ title: z.string(), keyword: z.string() }),
        supporting: z.array(z.object({ title: z.string(), keyword: z.string() }))
      })
    )
  })
)
export type CalendarPlan = z.infer<typeof CalendarSchema>

export const AltKeywordsSchema = named(
  'alt_keywords',
  z.object({ keywords: z.array(z.object({ keyword: z.string(), why: z.string() })) })
)

export const SparConclusionSchema = named('spar_conclusion', z.object({ strategy_notes: z.string() }))

export const MetaFixSchema = named(
  'meta_fix',
  z.object({ seo_title: z.string(), meta_description: z.string(), slug: z.string() })
)

export function jsonSchemaOf(s: z.ZodType): object {
  const out = z.toJSONSchema(s, { target: 'draft-7' }) as Record<string, unknown>
  delete out.$schema
  return out
}

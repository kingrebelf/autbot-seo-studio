/** Shapes of the JSON the pipeline stores on a content row (see src/main/pipeline/schemas.ts). */
export interface KeywordOption {
  keyword: string
  intent: 'buy now' | 'compare' | 'learn' | 'local'
  difficulty_for_small_site: 'low' | 'medium' | 'high'
  volume: number | null
  volume_source: 'gsc' | 'dataforseo' | 'ai_estimate'
  why_it_fits: string
  cannibalization_risk: string | null
}

export interface ResearchData {
  keyword_options: KeywordOption[]
  competitor_snapshot: {
    title: string
    url: string
    page_type: string
    approx_words: number | null
    covers: string
    misses: string
  }[]
  content_gap: string[]
  questions: string[]
  recommendation: { keyword: string; content_type: string; why: string; worth_it: boolean }
  sources: string[]
  data_sources?: string[]
  model?: string
}

export interface OutlineItem {
  heading: string
  level: number
  key_points: string[]
}

export interface BriefData {
  search_intent: string
  audience: string
  angle: string
  h1: string
  outline: OutlineItem[]
  questions: string[]
  internal_links: { url: string; anchor: string }[]
  cta: string
  facts_needed: { key: string; question: string }[]
  secondary_keywords: string[]
}

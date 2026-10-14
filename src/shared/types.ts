export type Capability = 'text' | 'json' | 'vision' | 'webSearch' | 'imageGen' | 'longContext' | 'toolUse'
export const CAPABILITIES: Capability[] = [
  'text',
  'json',
  'vision',
  'webSearch',
  'imageGen',
  'longContext',
  'toolUse'
]

export const CONTENT_STATUSES = [
  'Idea',
  'Researching',
  'Awaiting choice',
  'Writing',
  'Checking',
  'Ready for review',
  'Draft sent',
  'Published',
  'Needs refresh'
] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export const CONTENT_TYPES = [
  'blog post',
  'service page',
  'landing page',
  'location page',
  'product page',
  'FAQ page',
  'comparison page',
  'how-to guide',
  'page',
  'refresh'
] as const
export type ContentType = (typeof CONTENT_TYPES)[number]

export const LENGTHS = {
  short: { label: 'Short (~800 words)', words: 800 },
  standard: { label: 'Standard (~1,500 words)', words: 1500 },
  indepth: { label: 'In-depth (~2,500 words)', words: 2500 },
  auto: { label: 'AI decides', words: 0 }
} as const
export type LengthKey = keyof typeof LENGTHS

export type Mode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

export type TaskKey = 'research' | 'writing' | 'seo' | 'factcheck' | 'imageGen' | 'vision' | 'quick'
export const TASKS: {
  key: TaskKey
  label: string
  needs: Capability[]
  prefers?: Capability[]
  note: string
}[] = [
  {
    key: 'research',
    label: 'Research & planning',
    needs: ['text', 'json'],
    prefers: ['webSearch'],
    note: 'Strongest available model'
  },
  { key: 'writing', label: 'Writing', needs: ['text'], note: 'Best writer available' },
  { key: 'seo', label: 'SEO pass & editing', needs: ['text', 'json'], note: 'Can be cheaper' },
  {
    key: 'factcheck',
    label: 'Fact-check & quality check',
    needs: ['text', 'json'],
    prefers: ['webSearch'],
    note: 'Should be a different model from Writing if one is available (a second opinion)'
  },
  {
    key: 'imageGen',
    label: 'Image generation',
    needs: ['imageGen'],
    note: 'Only shows image-capable models'
  },
  { key: 'vision', label: 'Image description (alt text)', needs: ['vision'], note: '' },
  {
    key: 'quick',
    label: 'Quick tasks (titles, meta, slugs)',
    needs: ['text', 'json'],
    note: 'Cheapest/fastest'
  }
]

export type JobStatus = 'queued' | 'running' | 'waiting_for_user' | 'done' | 'failed' | 'cancelled'

export const TONES = ['Friendly', 'Professional', 'Expert', 'Plain-spoken'] as const

export interface BusinessProfile {
  name: string
  url: string
  whatYouSell: string
  serviceArea: string
  customerType: string
  topServices: string[]
  competitors: string[]
  tone: string
  language: string
  country: string
  mustNotSay: string
  callToAction?: string
  facts?: string
}

export const EXPORT_FORMATS = ['generic', 'hugo', 'jekyll', 'astro', 'eleventy', 'nextjs-mdx'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export const IMAGE_STYLES = [
  'Photo-realistic',
  'Flat illustration',
  '3D render',
  'Minimal',
  'Brand colors'
] as const

export interface ImageStyle {
  style: string
  avoid: string
  brandColors?: string
  labelAiImages: boolean
}

export interface SiteSettings {
  defaultContentType?: ContentType
  defaultLength?: LengthKey
  monthlyBudgetUsd?: number | null
  addSchemaToContent?: boolean | null
  defaultCategories?: string[]
  authorNote?: string
  wpUrl?: string
  wpUser?: string
  wpSeoPlugin?: 'yoast' | 'rankmath' | 'aioseo' | null
  wpCanWrite?: { posts: boolean; pages: boolean }
  wpRevisionMode?: boolean
  gscProperty?: string
  indexNowKey?: string
  indexNowEnabled?: boolean
  rankLocation?: string
  rankDevice?: 'desktop' | 'mobile'
  weeklyRankCheck?: boolean
  socialCrop?: boolean
  imageFallback?: 'png' | 'jpg' | null
}

export type CheckState = 'pass' | 'warn' | 'fail'
export interface SeoCheckResult {
  id: string
  label: string
  state: CheckState
  detail: string
  weight: number
  fixable: boolean
}

export type SourceLabel =
  'GSC' | 'DataForSEO' | 'AI estimate' | 'Manual' | 'CSV' | 'Bing' | 'Autocomplete' | 'Serper' | 'Brave'

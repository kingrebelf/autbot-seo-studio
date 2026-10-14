import { sqliteTable, integer, text, real, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

const id = () => integer('id').primaryKey({ autoIncrement: true })
const createdAt = () =>
  integer('created_at')
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
const updatedAt = () =>
  integer('updated_at')
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>()

export const sites = sqliteTable('sites', {
  id: id(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  language: text('language').notNull().default('English'),
  country: text('country').notNull().default('US'),
  businessProfile: json<Record<string, unknown>>('business_profile_json'),
  strategyNotes: text('strategy_notes'),
  voiceSamples: json<string[]>('voice_samples_json'),
  imageStyle: json<Record<string, unknown>>('image_style_json'),
  exportFormat: text('export_format').notNull().default('generic'),
  settings: json<Record<string, unknown>>('settings_json'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const providerConnections = sqliteTable('provider_connections', {
  id: id(),
  providerId: text('provider_id').notNull().unique(),
  displayName: text('display_name').notNull(),
  authKind: text('auth_kind').notNull(),
  baseUrl: text('base_url'),
  /** Non-secret extras. Secrets live only in safeStorage under `secretRef`. */
  extra: json<Record<string, unknown>>('extra_json'),
  secretRef: text('secret_ref'),
  status: text('status').notNull().default('disconnected'),
  statusMessage: text('status_message'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const models = sqliteTable(
  'models',
  {
    id: id(),
    providerId: text('provider_id').notNull(),
    modelId: text('model_id').notNull(),
    label: text('label').notNull(),
    capabilities: json<string[]>('capabilities_json').notNull(),
    capabilityOverrides: json<Record<string, boolean>>('capability_overrides_json'),
    contextWindow: integer('context_window'),
    prices: json<{ input?: number; output?: number; image?: number }>('prices_json'),
    priceEdited: integer('price_edited', { mode: 'boolean' }).notNull().default(false),
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index('models_provider_idx').on(t.providerId)]
)

export const taskModels = sqliteTable('task_models', {
  id: id(),
  siteId: integer('site_id'),
  task: text('task').notNull(),
  providerId: text('provider_id'),
  modelId: text('model_id'),
  fallbackProviderId: text('fallback_provider_id'),
  fallbackModelId: text('fallback_model_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const pages = sqliteTable(
  'pages',
  {
    id: id(),
    siteId: integer('site_id').notNull(),
    url: text('url').notNull(),
    title: text('title'),
    metaDescription: text('meta_description'),
    h1: text('h1'),
    headings: json<string[]>('headings_json'),
    wordCount: integer('word_count'),
    internalLinks: json<string[]>('internal_links_json'),
    paragraphs: json<string[]>('paragraphs_json'),
    canonical: text('canonical'),
    statusCode: integer('status_code'),
    wpId: integer('wp_id'),
    wpType: text('wp_type'),
    focusKeyword: text('focus_keyword'),
    source: text('source').notNull().default('crawl'),
    lastCrawledAt: integer('last_crawled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index('pages_site_idx').on(t.siteId)]
)

export const content = sqliteTable(
  'content',
  {
    id: id(),
    siteId: integer('site_id').notNull(),
    type: text('type').notNull().default('blog post'),
    status: text('status').notNull().default('Idea'),
    mode: text('mode').notNull().default('A'),
    topic: text('topic'),
    notes: text('notes'),
    title: text('title'),
    slug: text('slug'),
    focusKeyword: text('focus_keyword'),
    secondaryKeywords: json<string[]>('secondary_keywords_json'),
    seoTitle: text('seo_title'),
    metaDescription: text('meta_description'),
    excerpt: text('excerpt'),
    categories: json<string[]>('categories_json'),
    tags: json<string[]>('tags_json'),
    bodyHtml: text('body_html'),
    schema: json<unknown>('schema_json'),
    seoScore: integer('seo_score'),
    checks: json<Record<string, unknown>>('checks_json'),
    research: json<Record<string, unknown>>('research_json'),
    brief: json<Record<string, unknown>>('brief_json'),
    facts: json<Record<string, string>>('facts_json'),
    targetWords: integer('target_words'),
    clusterId: text('cluster_id'),
    isPillar: integer('is_pillar', { mode: 'boolean' }).notNull().default(false),
    refreshOfUrl: text('refresh_of_url'),
    refreshOfWpId: integer('refresh_of_wp_id'),
    modelOverrides: json<Record<string, { providerId: string; modelId: string }>>('model_overrides_json'),
    reviewChecklist: json<boolean[]>('review_checklist_json'),
    wpPostId: integer('wp_post_id'),
    wpPostType: text('wp_post_type'),
    wpEditUrl: text('wp_edit_url'),
    liveUrl: text('live_url'),
    publishedAt: integer('published_at'),
    indexStatus: text('index_status'),
    indexCheckedAt: integer('index_checked_at'),
    calendarItemId: integer('calendar_item_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index('content_site_idx').on(t.siteId)]
)

export const contentVersions = sqliteTable('content_versions', {
  id: id(),
  contentId: integer('content_id').notNull(),
  bodyHtml: text('body_html'),
  meta: json<Record<string, unknown>>('meta_json'),
  note: text('note'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const images = sqliteTable('images', {
  id: id(),
  siteId: integer('site_id').notNull(),
  contentId: integer('content_id'),
  slot: text('slot'),
  filePath: text('file_path').notNull(),
  fallbackPath: text('fallback_path'),
  filename: text('filename').notNull(),
  alt: text('alt'),
  title: text('title'),
  caption: text('caption'),
  description: text('description'),
  prompt: text('prompt'),
  modelId: text('model_id'),
  width: integer('width'),
  height: integer('height'),
  wpMediaId: integer('wp_media_id'),
  wpUrl: text('wp_url'),
  aiGenerated: integer('ai_generated', { mode: 'boolean' }).notNull().default(false),
  selected: integer('selected', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const keywords = sqliteTable('keywords', {
  id: id(),
  siteId: integer('site_id').notNull(),
  keyword: text('keyword').notNull(),
  groupName: text('group_name'),
  targetPageUrl: text('target_page_url'),
  location: text('location'),
  device: text('device'),
  source: text('source').notNull().default('Manual'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const rankHistory = sqliteTable(
  'rank_history',
  {
    id: id(),
    keywordId: integer('keyword_id').notNull(),
    date: text('date').notNull(),
    position: real('position'),
    clicks: integer('clicks'),
    impressions: integer('impressions'),
    ctr: real('ctr'),
    source: text('source').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index('rank_kw_idx').on(t.keywordId, t.date)]
)

export const calendarItems = sqliteTable('calendar_items', {
  id: id(),
  siteId: integer('site_id').notNull(),
  month: text('month').notNull(),
  focus: text('focus'),
  itemType: text('item_type').notNull().default('supporting'),
  title: text('title').notNull(),
  keyword: text('keyword'),
  why: text('why'),
  status: text('status').notNull().default('planned'),
  contentId: integer('content_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const jobs = sqliteTable('jobs', {
  id: id(),
  siteId: integer('site_id'),
  contentId: integer('content_id'),
  type: text('type').notNull(),
  status: text('status').notNull().default('queued'),
  step: text('step'),
  progress: text('progress'),
  input: json<Record<string, unknown>>('input_json'),
  output: json<Record<string, unknown>>('output_json'),
  error: text('error'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const aiUsage = sqliteTable('ai_usage', {
  id: id(),
  siteId: integer('site_id'),
  providerId: text('provider_id').notNull(),
  modelId: text('model_id').notNull(),
  task: text('task').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  images: integer('images').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0),
  contentId: integer('content_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const promptTemplates = sqliteTable('prompt_templates', {
  id: id(),
  key: text('key').notNull().unique(),
  body: text('body').notNull(),
  isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

/** App-wide settings (theme, data-source toggles, first-run state...). Never secrets. */
export const appSettings = sqliteTable('app_settings', {
  id: id(),
  key: text('key').notNull().unique(),
  value: json<unknown>('value_json'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

/** In-app notifications (rank alerts, ready for review, ...). */
export const notifications = sqliteTable('notifications', {
  id: id(),
  siteId: integer('site_id'),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  link: text('link'),
  read: integer('read', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

/** Activity log shown on the dashboard. */
export const activity = sqliteTable('activity', {
  id: id(),
  siteId: integer('site_id'),
  message: text('message').notNull(),
  link: text('link'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { route, siteIdInput } from './route'
import { listSites, createSite, updateSite, deleteSite, getSite } from '../sites'
import { getDb, schema } from '../db'
import { setSetting } from '../settings'
import { enqueue } from '../jobs/queue'
import { siteHealth } from '../dashboard'
import { lastCrawl } from '../jobs/scheduler'
import { wpConnected } from '../publish/wordpress'
import { EXPORT_FORMATS, CONTENT_TYPES } from '@shared/types'

export const profileSchema = z.object({
  name: z.string().min(1, 'Enter your business name'),
  url: z.string().min(3, 'Enter your website address'),
  whatYouSell: z.string().default(''),
  serviceArea: z.string().default(''),
  customerType: z.string().default(''),
  topServices: z.array(z.string()).default([]),
  competitors: z.array(z.string()).default([]),
  tone: z.string().default('Friendly'),
  language: z.string().default('English'),
  country: z.string().default('US'),
  mustNotSay: z.string().default(''),
  callToAction: z.string().optional(),
  facts: z.string().optional()
})

const siteSettingsSchema = z
  .object({
    defaultContentType: z.enum(CONTENT_TYPES).optional(),
    defaultLength: z.enum(['short', 'standard', 'indepth', 'auto']).optional(),
    monthlyBudgetUsd: z.number().nonnegative().nullable().optional(),
    addSchemaToContent: z.boolean().nullable().optional(),
    defaultCategories: z.array(z.string()).optional(),
    authorNote: z.string().optional(),
    wpRevisionMode: z.boolean().optional(),
    indexNowEnabled: z.boolean().optional(),
    rankLocation: z.string().optional(),
    rankDevice: z.enum(['desktop', 'mobile']).optional(),
    weeklyRankCheck: z.boolean().optional(),
    socialCrop: z.boolean().optional(),
    imageFallback: z.enum(['png', 'jpg']).nullable().optional()
  })
  .strict()

export const sitesRoutes = {
  'sites.list': route(z.undefined().optional(), () =>
    listSites().map((s) => ({ ...s, wpConnected: wpConnected(s) }))
  ),
  'sites.get': route(siteIdInput, ({ siteId }) => {
    const s = getSite(siteId)
    return { ...s, wpConnected: wpConnected(s) }
  }),
  'sites.create': route(profileSchema, (p) => {
    const s = createSite(p)
    setSetting('activeSiteId', s.id)
    enqueue({ type: 'crawl', siteId: s.id })
    return s
  }),
  'sites.update': route(
    z.object({
      siteId: z.number(),
      profile: profileSchema.optional(),
      strategyNotes: z.string().optional(),
      voiceSamples: z.array(z.string()).max(3).optional(),
      imageStyle: z
        .object({
          style: z.string(),
          avoid: z.string(),
          brandColors: z.string().optional(),
          labelAiImages: z.boolean()
        })
        .optional(),
      exportFormat: z.enum(EXPORT_FORMATS).optional(),
      settings: siteSettingsSchema.optional()
    }),
    ({ siteId, ...patch }) => updateSite(siteId, patch)
  ),
  'sites.delete': route(siteIdInput, ({ siteId }) => deleteSite(siteId)),
  'sites.setActive': route(siteIdInput, ({ siteId }) => setSetting('activeSiteId', siteId)),
  'sites.pages': route(siteIdInput, ({ siteId }) =>
    getDb()
      .select()
      .from(schema.pages)
      .where(eq(schema.pages.siteId, siteId))
      .all()
      .map((p) => ({
        id: p.id,
        url: p.url,
        title: p.title,
        wordCount: p.wordCount,
        wpId: p.wpId,
        source: p.source,
        paragraphs: (p.paragraphs ?? []).slice(0, 4)
      }))
  ),
  'sites.crawl': route(siteIdInput, ({ siteId }) => enqueue({ type: 'crawl', siteId })),
  'sites.health': route(siteIdInput, ({ siteId }) => ({
    ...siteHealth(siteId),
    lastCrawl: lastCrawl(siteId) || null
  })),
  'firstRun.complete': route(z.undefined().optional(), () => setSetting('firstRunDone', true))
}

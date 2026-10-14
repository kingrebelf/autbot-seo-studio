import { z } from 'zod'
import { readFileSync, writeFileSync } from 'node:fs'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { route, none, siteIdInput, idInput } from './route'
import { rt } from '../runtime'
import { getDb, schema } from '../db'
import { enqueue } from '../jobs/queue'
import { startRefresh, sparChat, sparConclude } from '../pipeline/modes'
import { getSite, updateSite, settingsOf } from '../sites'
import { getContent } from '../content'
import {
  planImagePrompts,
  pickImage,
  applyImageText,
  describeImage,
  addOwnImage,
  library,
  deleteImage,
  reuseImage,
  getImage
} from '../pipeline/images'
import { hasCapableModel } from '../providers/registry'
import {
  WordPressClient,
  saveWordPressPassword,
  wpClientFor,
  wpConnected,
  wpSecretRef
} from '../publish/wordpress'
import { deleteSecret, setSecret, getSecret, deleteSecret as removeSecret } from '../secrets'
import {
  gscConnected,
  connectGoogle,
  disconnectGoogle,
  listProperties,
  setGoogleClient,
  matchProperty,
  GOOGLE_CLIENT_SECRET
} from '../indexing/gsc'
import { generateIndexNowKey, keyFileName, keyLocation, pingIndexNow } from '../indexing/indexnow'
import { getSetting, setSetting } from '../settings'
import { DFS_SECRET, testDataForSeo, dataForSeoConfigured } from '../research/dataforseo'
import { SERPER_SECRET, BRAVE_SECRET, topResults } from '../research/serp'
import { BING_SECRET, bingQueryStats } from '../research/bing'
import {
  listKeywords,
  addKeyword,
  removeKeyword,
  updateKeyword,
  chartData,
  winnersLosers,
  importCsv,
  exportCsv,
  addManualRank
} from '../tracking/ranks'
import { toCsv } from '../publish/export'
import { UserError } from '../errors'

const LOCAL_PAGES_WARN = 10

export const featureRoutes = {
  /* ------------------------------------------------ modes */
  'modes.start': route(
    z.object({
      siteId: z.number(),
      mode: z.enum(['B', 'C', 'D', 'E', 'F', 'G']),
      notes: z.string().optional(),
      topic: z.string().optional(),
      url: z.string().optional(),
      areas: z.array(z.string()).optional(),
      count: z.number().int().min(3).max(8).optional(),
      months: z.number().optional(),
      length: z.enum(['short', 'standard', 'indepth', 'auto']).optional(),
      replace: z.boolean().optional()
    }),
    ({ siteId, mode, ...input }) => {
      switch (mode) {
        case 'D':
          if (!input.url) throw new UserError('Pick the page you want to refresh.')
          return { contentId: startRefresh(siteId, input.url, input.notes) }
        case 'E':
          if (!input.topic) throw new UserError('Type the main topic for the set.')
          return { jobId: enqueue({ type: 'mode-e', siteId, input }).id }
        case 'F':
          if (!input.topic) throw new UserError('Type the service the local pages are for.')
          if (!input.areas?.length) throw new UserError('List at least one town or area.')
          return { jobId: enqueue({ type: 'mode-f', siteId, input }).id }
        default:
          return { jobId: enqueue({ type: `mode-${mode.toLowerCase()}`, siteId, input }).id }
      }
    }
  ),
  'modes.localWarning': route(z.object({ count: z.number() }), ({ count }) =>
    count > LOCAL_PAGES_WARN
      ? "Lots of near-identical town pages can hurt you. Let's make each one genuinely useful."
      : null
  ),
  'modes.latest': route(
    z.object({ siteId: z.number(), type: z.string() }),
    ({ siteId, type }) =>
      getDb()
        .select()
        .from(schema.jobs)
        .where(and(eq(schema.jobs.siteId, siteId), eq(schema.jobs.type, type)))
        .orderBy(desc(schema.jobs.id))
        .get() ?? null
  ),

  /* ------------------------------------------------ calendar + spar */
  'calendar.list': route(siteIdInput, ({ siteId }) =>
    getDb()
      .select()
      .from(schema.calendarItems)
      .where(eq(schema.calendarItems.siteId, siteId))
      .orderBy(schema.calendarItems.month, schema.calendarItems.id)
      .all()
  ),
  'calendar.add': route(
    z.object({
      siteId: z.number(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      title: z.string().min(1),
      keyword: z.string().optional(),
      itemType: z.string().optional(),
      focus: z.string().optional(),
      why: z.string().optional()
    }),
    (i) =>
      getDb()
        .insert(schema.calendarItems)
        .values({ ...i, itemType: i.itemType ?? 'supporting' })
        .returning()
        .get()
  ),
  'calendar.update': route(
    z.object({
      id: z.number(),
      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
      title: z.string().optional(),
      keyword: z.string().optional(),
      why: z.string().optional(),
      status: z.string().optional(),
      focus: z.string().optional(),
      itemType: z.enum(['main', 'supporting']).optional()
    }),
    ({ id, ...patch }) => {
      getDb()
        .update(schema.calendarItems)
        .set({ ...patch, updatedAt: Date.now() })
        .where(eq(schema.calendarItems.id, id))
        .run()
    }
  ),
  'calendar.delete': route(idInput, ({ id }) => {
    getDb().delete(schema.calendarItems).where(eq(schema.calendarItems.id, id)).run()
  }),
  'calendar.exportCsv': route(siteIdInput, async ({ siteId }) => {
    const items = getDb()
      .select()
      .from(schema.calendarItems)
      .where(eq(schema.calendarItems.siteId, siteId))
      .orderBy(schema.calendarItems.month)
      .all()
    const dest = await rt().saveDialog({
      title: 'Export content calendar',
      defaultPath: 'content-calendar.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (!dest) return null
    writeFileSync(
      dest,
      toCsv([
        ['month', 'focus', 'type', 'title', 'keyword', 'why', 'status'],
        ...items.map((i) => [i.month, i.focus, i.itemType, i.title, i.keyword, i.why, i.status])
      ])
    )
    return dest
  }),
  'spar.chat': route(
    z.object({
      siteId: z.number(),
      numbers: z.record(z.string(), z.string()),
      history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })),
      message: z.string().min(1)
    }),
    ({ siteId, numbers, history, message }) => sparChat(siteId, numbers, history, message)
  ),
  'spar.conclude': route(
    z.object({
      siteId: z.number(),
      history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })).min(1)
    }),
    ({ siteId, history }) => sparConclude(siteId, history)
  ),

  /* ------------------------------------------------ images */
  'images.available': route(none, () => ({
    generate: hasCapableModel('imageGen'),
    vision: hasCapableModel('vision')
  })),
  'images.plan': route(
    z.object({ contentId: z.number(), slots: z.array(z.string()).min(1).max(6) }),
    ({ contentId, slots }) => planImagePrompts(contentId, slots)
  ),
  'images.generate': route(
    z.object({
      contentId: z.number(),
      slots: z
        .array(
          z.object({ slot: z.string(), prompt: z.string().min(3), count: z.number().int().min(1).max(4) })
        )
        .min(1)
    }),
    ({ contentId, slots }) => {
      const c = getContent(contentId)
      return enqueue({ type: 'images', siteId: c.siteId, contentId, input: { slots } })
    }
  ),
  'images.pick': route(idInput, ({ id }) => pickImage(id)),
  'images.update': route(
    z.object({
      id: z.number(),
      filename: z.string().optional(),
      alt: z.string().max(125).optional(),
      title: z.string().optional(),
      caption: z.string().optional(),
      description: z.string().optional()
    }),
    ({ id, ...t }) => applyImageText(id, t)
  ),
  'images.describe': route(idInput, ({ id }) => describeImage(id)),
  'images.addOwn': route(
    z.object({ siteId: z.number(), contentId: z.number().nullable(), slot: z.string() }),
    async ({ siteId, contentId, slot }) => {
      const [file] = await rt().openDialog({
        title: 'Choose a photo',
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'tif', 'tiff', 'avif', 'heic'] }
        ]
      })
      if (!file) return null
      return addOwnImage(siteId, contentId, slot, readFileSync(file))
    }
  ),
  'images.library': route(
    z.object({ siteId: z.number(), search: z.string().optional() }),
    ({ siteId, search }) => library(siteId, search)
  ),
  'images.delete': route(idInput, ({ id }) => deleteImage(id)),
  'images.reuse': route(
    z.object({ id: z.number(), contentId: z.number(), slot: z.string() }),
    ({ id, contentId, slot }) => reuseImage(id, contentId, slot)
  ),
  'images.get': route(idInput, ({ id }) => getImage(id)),
  'images.forContent': route(z.object({ ids: z.array(z.number()) }), ({ ids }) =>
    ids.length ? getDb().select().from(schema.images).where(inArray(schema.images.id, ids)).all() : []
  ),

  /* ------------------------------------------------ WordPress */
  'wp.save': route(
    z.object({
      siteId: z.number(),
      url: z.string().min(4),
      user: z.string().min(1),
      password: z.string().optional()
    }),
    async ({ siteId, url, user, password }) => {
      const site = getSite(siteId)
      const pass = password?.trim() || getSecret(wpSecretRef(siteId))
      if (!pass) throw new UserError('Paste the application password from WordPress.')
      const wpUrl = /^https?:\/\//i.test(url) ? url.replace(/\/$/, '') : `https://${url.replace(/\/$/, '')}`
      const client = new WordPressClient(wpUrl, user.trim(), pass)
      const r = await client.test()
      if (password?.trim()) saveWordPressPassword(siteId, password)
      updateSite(siteId, {
        settings: {
          wpUrl,
          wpUser: user.trim(),
          wpSeoPlugin: r.seoPlugin,
          wpCanWrite: { posts: r.canPosts, pages: r.canPages }
        } as never
      })
      if (site.id) enqueue({ type: 'wp-import', siteId })
      return r
    }
  ),
  'wp.test': route(siteIdInput, ({ siteId }) => wpClientFor(getSite(siteId)).test()),
  'wp.status': route(siteIdInput, ({ siteId }) => {
    const s = getSite(siteId)
    const st = settingsOf(s)
    return {
      connected: wpConnected(s),
      url: st.wpUrl ?? s.url,
      user: st.wpUser ?? '',
      seoPlugin: st.wpSeoPlugin ?? null,
      canWrite: st.wpCanWrite ?? null
    }
  }),
  'wp.import': route(siteIdInput, ({ siteId }) => enqueue({ type: 'wp-import', siteId })),
  'wp.sync': route(siteIdInput, ({ siteId }) => enqueue({ type: 'wp-sync', siteId })),
  'wp.disconnect': route(siteIdInput, ({ siteId }) => {
    deleteSecret(wpSecretRef(siteId))
    updateSite(siteId, { settings: { wpUser: undefined, wpSeoPlugin: null } as never })
  }),

  /* ------------------------------------------------ Google + IndexNow */
  'google.status': route(none, () => ({
    clientId: getSetting('googleClientId'),
    hasClientSecret: Boolean(getSecret(GOOGLE_CLIENT_SECRET)),
    connected: gscConnected()
  })),
  'google.setClient': route(
    z.object({
      clientId: z.string().min(10, 'Paste the whole client ID'),
      clientSecret: z.string().optional()
    }),
    ({ clientId, clientSecret }) => setGoogleClient(clientId, clientSecret)
  ),
  'google.connect': route(none, async () => {
    await connectGoogle()
    return listProperties()
  }),
  'google.disconnect': route(none, () => disconnectGoogle()),
  'google.properties': route(none, () => listProperties()),
  'google.autoProperty': route(siteIdInput, async ({ siteId }) => {
    const s = getSite(siteId)
    const p = matchProperty(await listProperties(), s.url)
    if (p) updateSite(siteId, { settings: { gscProperty: p } as never })
    return p
  }),
  'google.setProperty': route(
    z.object({ siteId: z.number(), property: z.string() }),
    ({ siteId, property }) => {
      updateSite(siteId, { settings: { gscProperty: property } as never })
      enqueue({ type: 'gsc-pull', siteId })
    }
  ),
  'google.pull': route(siteIdInput, ({ siteId }) => enqueue({ type: 'gsc-pull', siteId })),
  'indexnow.generate': route(siteIdInput, ({ siteId }) => {
    const key = generateIndexNowKey()
    const s = updateSite(siteId, { settings: { indexNowKey: key, indexNowEnabled: true } as never })
    return { key, fileName: keyFileName(key), location: keyLocation(s.url, key) }
  }),
  'indexnow.info': route(siteIdInput, ({ siteId }) => {
    const s = getSite(siteId)
    const st = settingsOf(s)
    return {
      enabled: st.indexNowEnabled !== false,
      key: st.indexNowKey ?? null,
      fileName: st.indexNowKey ? keyFileName(st.indexNowKey) : null,
      location: st.indexNowKey ? keyLocation(s.url, st.indexNowKey) : null
    }
  }),
  'indexnow.saveKeyFile': route(siteIdInput, async ({ siteId }) => {
    const st = settingsOf(getSite(siteId))
    if (!st.indexNowKey) throw new UserError('Generate an IndexNow key first.')
    const dest = await rt().saveDialog({
      title: 'Save IndexNow key file',
      defaultPath: keyFileName(st.indexNowKey),
      filters: [{ name: 'Text', extensions: ['txt'] }]
    })
    if (!dest) return null
    writeFileSync(dest, st.indexNowKey)
    return dest
  }),
  'indexnow.test': route(siteIdInput, ({ siteId }) => {
    const s = getSite(siteId)
    const st = settingsOf(s)
    if (!st.indexNowKey) throw new UserError('Generate an IndexNow key first.')
    return pingIndexNow(s.url, st.indexNowKey, [`${s.url}/`])
  }),

  /* ------------------------------------------------ data sources */
  'ds.status': route(none, () => ({
    dataforseo: { login: getSetting('dataforseoLogin'), connected: dataForSeoConfigured() },
    serper: Boolean(getSecret(SERPER_SECRET)),
    brave: Boolean(getSecret(BRAVE_SECRET)),
    serpProvider: getSetting('serpProvider'),
    bing: Boolean(getSecret(BING_SECRET)),
    autocomplete: getSetting('autocompleteEnabled'),
    crawlMaxPages: getSetting('crawlMaxPages')
  })),
  'ds.save': route(
    z.object({
      kind: z.enum(['dataforseo', 'serper', 'brave', 'bing']),
      login: z.string().optional(),
      secret: z.string().min(4, 'Paste the key or password')
    }),
    async ({ kind, login, secret }) => {
      if (kind === 'dataforseo') {
        if (!login) throw new UserError('Enter your DataForSEO login (email).')
        setSetting('dataforseoLogin', login.trim())
        setSecret(DFS_SECRET, secret.trim())
        return testDataForSeo()
      }
      if (kind === 'bing') {
        setSecret(BING_SECRET, secret.trim())
        return {
          ok: true,
          message: 'Saved. Bing data is read when the site is verified in Bing Webmaster Tools.'
        }
      }
      setSecret(kind === 'serper' ? SERPER_SECRET : BRAVE_SECRET, secret.trim())
      setSetting('serpProvider', kind)
      try {
        const r = await topResults('test', 'us', 'en', undefined, kind)
        return { ok: true, message: `Connected. Got ${r.length} results for a test search.` }
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : 'Test failed.' }
      }
    }
  ),
  'ds.remove': route(z.object({ kind: z.enum(['dataforseo', 'serper', 'brave', 'bing']) }), ({ kind }) => {
    if (kind === 'dataforseo') {
      removeSecret(DFS_SECRET)
      setSetting('dataforseoLogin', '')
    } else if (kind === 'bing') removeSecret(BING_SECRET)
    else {
      removeSecret(kind === 'serper' ? SERPER_SECRET : BRAVE_SECRET)
      if (getSetting('serpProvider') === kind) setSetting('serpProvider', '')
    }
  }),
  'ds.bingQueries': route(siteIdInput, ({ siteId }) => bingQueryStats(getSite(siteId).url)),

  /* ------------------------------------------------ keywords */
  'keywords.list': route(siteIdInput, ({ siteId }) => listKeywords(siteId)),
  'keywords.add': route(
    z.object({
      siteId: z.number(),
      keyword: z.string().min(1),
      group: z.string().optional(),
      targetUrl: z.string().optional()
    }),
    ({ siteId, keyword, group, targetUrl }) =>
      addKeyword(siteId, keyword, { group, targetUrl, source: 'Manual' })
  ),
  'keywords.remove': route(idInput, ({ id }) => removeKeyword(id)),
  'keywords.update': route(
    z.object({
      id: z.number(),
      groupName: z.string().nullable().optional(),
      targetPageUrl: z.string().nullable().optional()
    }),
    ({ id, ...p }) => updateKeyword(id, p)
  ),
  'keywords.chart': route(idInput, ({ id }) => chartData(id)),
  'keywords.winnersLosers': route(siteIdInput, ({ siteId }) => winnersLosers(siteId)),
  'keywords.manualRank': route(
    z.object({
      id: z.number(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      position: z.number().positive()
    }),
    ({ id, date, position }) => addManualRank(id, date, position)
  ),
  'keywords.importCsv': route(siteIdInput, async ({ siteId }) => {
    const [file] = await rt().openDialog({
      title: 'Import keywords CSV',
      filters: [{ name: 'CSV', extensions: ['csv', 'txt', 'tsv'] }]
    })
    if (!file) return null
    return importCsv(siteId, readFileSync(file, 'utf8'))
  }),
  'keywords.importCsvText': route(z.object({ siteId: z.number(), text: z.string() }), ({ siteId, text }) =>
    importCsv(siteId, text)
  ),
  'keywords.exportCsv': route(siteIdInput, async ({ siteId }) => {
    const dest = await rt().saveDialog({
      title: 'Export keywords',
      defaultPath: 'keywords.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (!dest) return null
    writeFileSync(dest, exportCsv(siteId))
    return dest
  }),
  'keywords.checkNow': route(siteIdInput, ({ siteId }) => {
    if (dataForSeoConfigured()) enqueue({ type: 'rank-check', siteId })
    if (gscConnected() && settingsOf(getSite(siteId)).gscProperty) enqueue({ type: 'gsc-pull', siteId })
    if (!dataForSeoConfigured() && !gscConnected())
      throw new UserError(
        'Connect Google Search Console (free) or DataForSEO to check rankings automatically. You can also type positions in by hand or import a CSV.'
      )
  })
}

import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { route, none } from './route'
import {
  visibleMetas,
  listConnections,
  saveConnection,
  testAndRefresh,
  disconnect,
  refreshModels,
  autoFillTasks,
  connectedModels,
  getConnection,
  setConnectionStatus,
  hasCapableModel,
  effectiveCaps
} from '../providers/registry'
import { signInWithChatGPT, hostIdFrom } from '../providers/openai-chatgpt-plan'
import { getDb, schema } from '../db'
import { getSetting } from '../settings'
import { TASKS, CAPABILITIES } from '@shared/types'
import { UserError } from '../errors'

const taskKey = z.enum(['research', 'writing', 'seo', 'factcheck', 'imageGen', 'vision', 'quick'])

export const providerRoutes = {
  'providers.metas': route(none, () => visibleMetas()),
  'providers.list': route(none, () => listConnections()),
  'providers.save': route(
    z.object({
      type: z.string(),
      connectionId: z.string().optional(),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
      extra: z.record(z.string(), z.unknown()).optional()
    }),
    async (i) => {
      const id = saveConnection(i)
      return { id, ...(await testAndRefresh(id)) }
    }
  ),
  'providers.test': route(z.object({ id: z.string() }), ({ id }) => testAndRefresh(id)),
  'providers.disconnect': route(z.object({ id: z.string() }), ({ id }) => {
    disconnect(id)
    autoFillTasks()
  }),
  'providers.refreshModels': route(z.object({ id: z.string() }), async ({ id }) => {
    const n = await refreshModels(id)
    autoFillTasks()
    return n
  }),
  'providers.signInChatGPT': route(none, async () => {
    const id = saveConnection({ type: 'chatgpt-plan' })
    // Persist this installation's host ID before the first sign-in, as OpenAI requires.
    const hostId = hostIdFrom(getConnection(id)!.extra ?? {})
    saveConnection({ type: 'chatgpt-plan', extra: { extAgentHostId: hostId } })
    const r = await signInWithChatGPT(getConnection(id)!.extra ?? {})
    saveConnection({
      type: 'chatgpt-plan',
      extra: {
        clientId: r.creds.client_id,
        extAgentHostId: r.creds.ext_agent_host_id,
        email: r.creds.email ?? ''
      }
    })
    if (!r.eligible) {
      const msg =
        "Your ChatGPT plan isn't eligible for use in other apps. You can use an OpenAI API key instead."
      setConnectionStatus(id, 'error', msg)
      return { ok: false, message: msg, models: 0 }
    }
    return testAndRefresh(id)
  }),
  'models.list': route(z.object({ showAll: z.boolean().optional() }), ({ showAll }) => {
    const all = showAll ?? getSetting('showAllModels')
    return connectedModels()
      .filter((m) => all || !m.hidden)
      .map((m) => ({ ...m, caps: effectiveCaps(m) }))
  }),
  'models.update': route(
    z.object({
      id: z.number(),
      capabilityOverrides: z.record(z.enum(CAPABILITIES as [string, ...string[]]), z.boolean()).optional(),
      prices: z
        .object({
          input: z.number().nonnegative().optional(),
          output: z.number().nonnegative().optional(),
          image: z.number().nonnegative().optional()
        })
        .optional(),
      hidden: z.boolean().optional()
    }),
    ({ id, capabilityOverrides, prices, hidden }) => {
      const set: Partial<typeof schema.models.$inferInsert> = { updatedAt: Date.now() }
      if (capabilityOverrides) set.capabilityOverrides = capabilityOverrides
      if (prices) {
        set.prices = prices
        set.priceEdited = true
      }
      if (hidden !== undefined) set.hidden = hidden
      getDb().update(schema.models).set(set).where(eq(schema.models.id, id)).run()
    }
  ),
  'tasks.get': route(z.object({ siteId: z.number().nullable().optional() }), ({ siteId }) =>
    TASKS.map((t) => {
      const global = getDb()
        .select()
        .from(schema.taskModels)
        .where(and(eq(schema.taskModels.task, t.key), isNull(schema.taskModels.siteId)))
        .get()
      const site = siteId
        ? getDb()
            .select()
            .from(schema.taskModels)
            .where(and(eq(schema.taskModels.task, t.key), eq(schema.taskModels.siteId, siteId)))
            .get()
        : undefined
      return { ...t, assignment: global ?? null, siteAssignment: site ?? null }
    })
  ),
  'tasks.set': route(
    z.object({
      task: taskKey,
      siteId: z.number().nullable().optional(),
      providerId: z.string().nullable(),
      modelId: z.string().nullable(),
      fallbackProviderId: z.string().nullable().optional(),
      fallbackModelId: z.string().nullable().optional()
    }),
    (i) => {
      const t = TASKS.find((x) => x.key === i.task)!
      if (i.modelId) {
        const m = connectedModels().find((x) => x.providerId === i.providerId && x.modelId === i.modelId)
        if (!m) throw new UserError('That model is not available. Refresh the models list and pick again.')
        const missing = t.needs.filter((n) => !m.caps.includes(n))
        if (missing.length)
          throw new UserError(
            `That model can't do this task (it lacks: ${missing.join(', ')}). Pick another one.`
          )
      }
      const db = getDb()
      const where = i.siteId
        ? and(eq(schema.taskModels.task, i.task), eq(schema.taskModels.siteId, i.siteId))
        : and(eq(schema.taskModels.task, i.task), isNull(schema.taskModels.siteId))
      const row = db.select().from(schema.taskModels).where(where).get()
      const values = {
        providerId: i.providerId,
        modelId: i.modelId,
        ...(i.fallbackProviderId !== undefined
          ? { fallbackProviderId: i.fallbackProviderId, fallbackModelId: i.fallbackModelId ?? null }
          : {}),
        updatedAt: Date.now()
      }
      if (row) db.update(schema.taskModels).set(values).where(eq(schema.taskModels.id, row.id)).run()
      else
        db.insert(schema.taskModels)
          .values({ task: i.task, siteId: i.siteId ?? null, ...values })
          .run()
    }
  ),
  'tasks.autofill': route(none, () => autoFillTasks(true)),
  'capabilities.has': route(z.object({ cap: z.enum(CAPABILITIES as [string, ...string[]]) }), ({ cap }) =>
    hasCapableModel(cap as never)
  )
}

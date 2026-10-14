import { and, eq, isNull } from 'drizzle-orm'
import { getDb, schema } from '../db'
import { getSecret, setSecret, deleteSecret, hasSecret } from '../secrets'
import { rt } from '../runtime'
import { UserError } from '../errors'
import { log } from '../logger'
import { TASKS, type Capability, type TaskKey } from '@shared/types'
import type { AIProvider, ModelInfo, ProviderConfig, ProviderMeta } from './types'
import { OpenAIProvider } from './openai-apikey'
import { ChatGPTPlanProvider, TOKENS_REF } from './openai-chatgpt-plan'
import { AnthropicProvider } from './anthropic'
import { GeminiProvider } from './gemini'
import { XAIProvider } from './xai'
import { MetaProvider, META_DEFAULT_BASE } from './meta'
import { OpenRouterProvider } from './openrouter'
import { OllamaProvider } from './ollama'
import { createCompatible } from './openai-compatible'
import { MockProvider } from './mock'

export const PROVIDER_METAS: ProviderMeta[] = [
  {
    id: 'chatgpt-plan',
    displayName: 'ChatGPT plan (Sign in with ChatGPT)',
    authKind: 'oauth',
    docsUrl: 'https://developers.openai.com/siwc',
    blurb: 'Use your ChatGPT Plus or Pro plan. Usage counts against your plan limits.'
  },
  {
    id: 'openai',
    displayName: 'OpenAI (API key)',
    authKind: 'apiKey',
    keyUrl: 'https://platform.openai.com/api-keys',
    blurb: 'Pay-as-you-go. Text, web search, vision and image generation.'
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic Claude',
    authKind: 'apiKey',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    blurb: 'Pay-as-you-go API key from the Claude Console. Great writer. No image generation.'
  },
  {
    id: 'gemini',
    displayName: 'Google Gemini',
    authKind: 'apiKey',
    keyUrl: 'https://aistudio.google.com/apikey',
    blurb: 'API key from Google AI Studio (has a free tier). Text, Google Search, images.'
  },
  {
    id: 'xai',
    displayName: 'xAI Grok',
    authKind: 'apiKey',
    keyUrl: 'https://console.x.ai',
    blurb: 'xAI API key. Text, live search, vision and Grok image models.'
  },
  {
    id: 'meta',
    displayName: 'Meta Muse Spark',
    authKind: 'apiKey',
    keyUrl: 'https://ai.developer.meta.com/',
    defaultBaseUrl: META_DEFAULT_BASE,
    baseUrlEditable: true,
    blurb: 'Meta Model API key (developer preview, US accounts at launch).',
    extraFields: [
      { key: 'authHeader', label: 'Auth header name', placeholder: 'authorization' },
      { key: 'authPrefix', label: 'Auth value prefix', placeholder: 'Bearer ' }
    ]
  },
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    authKind: 'apiKey',
    keyUrl: 'https://openrouter.ai/keys',
    blurb: 'One key, hundreds of models from all the companies above.'
  },
  {
    id: 'ollama',
    displayName: 'Ollama (local)',
    authKind: 'none',
    keyUrl: 'https://ollama.com/download',
    defaultBaseUrl: 'http://127.0.0.1:11434',
    baseUrlEditable: true,
    local: true,
    blurb: 'Free, private, runs on your computer. May be slower and less accurate.'
  },
  {
    id: 'lmstudio',
    displayName: 'LM Studio (local)',
    authKind: 'none',
    keyUrl: 'https://lmstudio.ai',
    defaultBaseUrl: 'http://127.0.0.1:1234/v1',
    baseUrlEditable: true,
    local: true,
    blurb: 'Free, private, runs on your computer. Start the local server in LM Studio first.'
  },
  {
    id: 'custom',
    displayName: 'Custom OpenAI-compatible endpoint',
    authKind: 'apiKey',
    keyOptional: true,
    baseUrlEditable: true,
    multi: true,
    blurb: 'Anything else that speaks the OpenAI API.',
    extraFields: [{ key: 'name', label: 'Name', placeholder: 'My server' }]
  },
  {
    id: 'mock',
    displayName: 'Mock provider (dev only)',
    authKind: 'none',
    devOnly: true,
    blurb: 'Returns canned responses so everything can be tested without keys.'
  }
]

export function visibleMetas(): ProviderMeta[] {
  return PROVIDER_METAS.filter((m) => !m.devOnly || rt().devMode)
}

/** Connection rows store `extra.type` = provider type; built-ins use the type as their id. */
export function typeOf(row: { providerId: string; extra: Record<string, unknown> | null }): string {
  return String(row.extra?.type ?? row.providerId)
}

const secretRef = (connectionId: string) => `provider:${connectionId}`

function build(type: string, cfg: ProviderConfig): AIProvider {
  switch (type) {
    case 'chatgpt-plan':
      return new ChatGPTPlanProvider(cfg)
    case 'openai':
      return new OpenAIProvider(cfg)
    case 'anthropic':
      return new AnthropicProvider(cfg)
    case 'gemini':
      return new GeminiProvider(cfg)
    case 'xai':
      return new XAIProvider(cfg)
    case 'meta':
      return new MetaProvider(cfg)
    case 'openrouter':
      return new OpenRouterProvider(cfg)
    case 'ollama':
      return new OllamaProvider(cfg)
    case 'lmstudio':
      return createCompatible(cfg, 'lmstudio')
    case 'custom':
      return createCompatible(cfg, 'custom')
    case 'mock':
      return new MockProvider()
    default:
      throw new UserError(`Unknown AI provider "${type}". Pick a provider from Settings > AI Models.`)
  }
}

/** Test seam: lets unit tests swap a provider implementation. */
const overrides = new Map<string, AIProvider>()
export function overrideProvider(connectionId: string, p: AIProvider | null): void {
  if (p) overrides.set(connectionId, p)
  else overrides.delete(connectionId)
}

export function getConnection(connectionId: string) {
  return getDb()
    .select()
    .from(schema.providerConnections)
    .where(eq(schema.providerConnections.providerId, connectionId))
    .get()
}

export function getProvider(connectionId: string): AIProvider {
  const o = overrides.get(connectionId)
  if (o) return o
  const row = getConnection(connectionId)
  const type = row ? typeOf(row) : connectionId
  if (type === 'mock' && !rt().devMode)
    throw new UserError('The mock provider is only available in developer mode.')
  return build(type, {
    connectionId,
    baseUrl: row?.baseUrl ?? undefined,
    apiKey: row?.secretRef ? getSecret(row.secretRef) : null,
    extra: row?.extra ?? {}
  })
}

export function listConnections() {
  return getDb()
    .select()
    .from(schema.providerConnections)
    .all()
    .map((r) => ({
      id: r.providerId,
      type: typeOf(r),
      displayName: r.displayName,
      authKind: r.authKind,
      baseUrl: r.baseUrl,
      extra: { ...(r.extra ?? {}) },
      hasKey: r.secretRef ? hasSecret(r.secretRef) : r.authKind === 'oauth' ? hasSecret(TOKENS_REF) : false,
      status: r.status,
      statusMessage: r.statusMessage
    }))
}

export function saveConnection(input: {
  type: string
  connectionId?: string
  apiKey?: string
  baseUrl?: string
  extra?: Record<string, unknown>
}): string {
  const meta = PROVIDER_METAS.find((m) => m.id === input.type)
  if (!meta) throw new UserError('Unknown provider. Pick one of the provider cards.')
  if (meta.devOnly && !rt().devMode)
    throw new UserError('The mock provider is only available in developer mode.')
  const db = getDb()
  let id = input.connectionId ?? (meta.multi ? `custom-${Date.now().toString(36)}` : meta.id)
  const existing = getConnection(id)
  if (!existing && meta.multi && !input.connectionId) id = `custom-${Date.now().toString(36)}`
  let ref = existing?.secretRef ?? null
  if (input.apiKey !== undefined && input.apiKey.trim() !== '') {
    ref = secretRef(id)
    setSecret(ref, input.apiKey.trim())
  }
  const extra: Record<string, unknown> = { ...(existing?.extra ?? {}), ...(input.extra ?? {}), type: meta.id }
  const displayName = meta.multi && extra.name ? String(extra.name) : meta.displayName
  const baseUrl = input.baseUrl?.trim() || existing?.baseUrl || meta.defaultBaseUrl || null
  if (existing)
    db.update(schema.providerConnections)
      .set({ secretRef: ref, extra, baseUrl, displayName, updatedAt: Date.now() })
      .where(eq(schema.providerConnections.providerId, id))
      .run()
  else
    db.insert(schema.providerConnections)
      .values({ providerId: id, displayName, authKind: meta.authKind, baseUrl, extra, secretRef: ref })
      .run()
  return id
}

export function setConnectionStatus(
  id: string,
  status: 'connected' | 'disconnected' | 'error',
  message: string
): void {
  getDb()
    .update(schema.providerConnections)
    .set({ status, statusMessage: message, updatedAt: Date.now() })
    .where(eq(schema.providerConnections.providerId, id))
    .run()
}

export async function testAndRefresh(id: string): Promise<{ ok: boolean; message: string; models: number }> {
  let r: { ok: boolean; message: string }
  try {
    r = await getProvider(id).testConnection()
  } catch (e) {
    r = {
      ok: false,
      message:
        e instanceof UserError ? e.message : 'The connection test failed. Check the details and try again.'
    }
    log.error(`Provider test failed for ${id}`, e)
  }
  setConnectionStatus(id, r.ok ? 'connected' : 'error', r.message)
  let count = 0
  if (r.ok) {
    count = await refreshModels(id)
    autoFillTasks()
  }
  return { ...r, models: count }
}

export async function refreshModels(id: string): Promise<number> {
  const list = await getProvider(id).listModels()
  storeModels(id, list)
  return list.length
}

export function storeModels(providerId: string, list: ModelInfo[]): void {
  const db = getDb()
  const existing = db.select().from(schema.models).where(eq(schema.models.providerId, providerId)).all()
  const byId = new Map(existing.map((m) => [m.modelId, m]))
  db.transaction((tx) => {
    for (const m of list) {
      const prev = byId.get(m.id)
      const prices = { input: m.inputPricePerMTok, output: m.outputPricePerMTok, image: m.pricePerImage }
      if (prev) {
        tx.update(schema.models)
          .set({
            label: m.label,
            capabilities: m.capabilities,
            contextWindow: m.contextWindow ?? null,
            hidden: Boolean(m.hidden),
            prices: prev.priceEdited ? prev.prices : prices,
            updatedAt: Date.now()
          })
          .where(eq(schema.models.id, prev.id))
          .run()
        byId.delete(m.id)
      } else
        tx.insert(schema.models)
          .values({
            providerId,
            modelId: m.id,
            label: m.label,
            capabilities: m.capabilities,
            contextWindow: m.contextWindow ?? null,
            prices,
            hidden: Boolean(m.hidden)
          })
          .run()
    }
    for (const gone of byId.values()) tx.delete(schema.models).where(eq(schema.models.id, gone.id)).run()
  })
}

export function disconnect(id: string): void {
  const row = getConnection(id)
  if (!row) return
  if (row.secretRef) deleteSecret(row.secretRef)
  if (typeOf(row) === 'chatgpt-plan') deleteSecret(TOKENS_REF)
  const db = getDb()
  db.delete(schema.models).where(eq(schema.models.providerId, id)).run()
  if (typeOf(row) === 'custom')
    db.delete(schema.providerConnections).where(eq(schema.providerConnections.providerId, id)).run()
  else setConnectionStatus(id, 'disconnected', 'Not connected')
}

export type ModelRow = typeof schema.models.$inferSelect

export function effectiveCaps(m: ModelRow): Capability[] {
  const caps = new Set(m.capabilities as Capability[])
  for (const [k, v] of Object.entries(m.capabilityOverrides ?? {})) {
    if (v) caps.add(k as Capability)
    else caps.delete(k as Capability)
  }
  return [...caps]
}

export function connectedModels(): (ModelRow & { caps: Capability[] })[] {
  const db = getDb()
  const conns = new Set(
    db
      .select()
      .from(schema.providerConnections)
      .where(eq(schema.providerConnections.status, 'connected'))
      .all()
      .filter((c) => typeOf(c) !== 'mock' || rt().devMode)
      .map((c) => c.providerId)
  )
  return db
    .select()
    .from(schema.models)
    .all()
    .filter((m) => conns.has(m.providerId))
    .map((m) => ({ ...m, caps: effectiveCaps(m) }))
}

function score(m: ModelRow & { caps: Capability[] }, task: TaskKey): number {
  const t = TASKS.find((x) => x.key === task)!
  let s = (m.contextWindow ?? 8000) / 1000
  for (const p of t.prefers ?? []) if (m.caps.includes(p)) s += 1000
  if (task === 'quick' || task === 'seo') {
    const price = m.prices?.input
    s = price === undefined || price === null ? 100 : 1000 - price * 10
  }
  return s
}

/**
 * Pick a model for each task that has none: the first connected provider's best model
 * (largest context + the needed capabilities). Fact-check prefers a different model from
 * Writing. Also sets a fallback when a second suitable model exists.
 */
export function autoFillTasks(force = false): void {
  const db = getDb()
  const models = connectedModels().filter((m) => !m.hidden)
  const conns = db
    .select()
    .from(schema.providerConnections)
    .all()
    .map((c) => c.providerId)
  const assigned: Partial<Record<TaskKey, { providerId: string; modelId: string }>> = {}
  for (const t of TASKS) {
    const row = db
      .select()
      .from(schema.taskModels)
      .where(and(eq(schema.taskModels.task, t.key), isNull(schema.taskModels.siteId)))
      .get()
    const stillValid =
      row?.modelId && models.some((m) => m.providerId === row.providerId && m.modelId === row.modelId)
    if (row && stillValid && !force) {
      assigned[t.key] = { providerId: row.providerId!, modelId: row.modelId! }
      continue
    }
    const ok = models.filter((m) => t.needs.every((n) => m.caps.includes(n)))
    if (!ok.length) continue
    // first connected provider that has a suitable model
    const firstProvider = conns.find((c) => ok.some((m) => m.providerId === c))
    let candidates = ok
      .filter((m) => m.providerId === firstProvider)
      .sort((a, b) => score(b, t.key) - score(a, t.key))
    if (t.key === 'factcheck' && assigned.writing) {
      const other = ok
        .filter(
          (m) => !(m.providerId === assigned.writing!.providerId && m.modelId === assigned.writing!.modelId)
        )
        .sort((a, b) => score(b, t.key) - score(a, t.key))
      if (other.length) candidates = other
    }
    const best = candidates[0]
    const fb = ok.filter((m) => m !== best).sort((a, b) => score(b, t.key) - score(a, t.key))[0]
    const values = {
      providerId: best.providerId,
      modelId: best.modelId,
      fallbackProviderId: fb?.providerId ?? null,
      fallbackModelId: fb?.modelId ?? null,
      updatedAt: Date.now()
    }
    if (row) db.update(schema.taskModels).set(values).where(eq(schema.taskModels.id, row.id)).run()
    else
      db.insert(schema.taskModels)
        .values({ task: t.key, siteId: null, ...values })
        .run()
    assigned[t.key] = { providerId: best.providerId, modelId: best.modelId }
  }
}

export function getTaskAssignment(task: TaskKey, siteId?: number | null) {
  const db = getDb()
  if (siteId) {
    const s = db
      .select()
      .from(schema.taskModels)
      .where(and(eq(schema.taskModels.task, task), eq(schema.taskModels.siteId, siteId)))
      .get()
    if (s?.modelId) return s
  }
  return db
    .select()
    .from(schema.taskModels)
    .where(and(eq(schema.taskModels.task, task), isNull(schema.taskModels.siteId)))
    .get()
}

export function hasCapableModel(cap: Capability): boolean {
  return connectedModels().some((m) => m.caps.includes(cap))
}

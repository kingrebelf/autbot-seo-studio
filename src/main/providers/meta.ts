import { responsesChat, listOpenAIStyleModels, type ResponsesClientOpts } from './openai-responses'
import { providerError } from './base'
import { mergeCaps } from './capabilities'
import fallback from './fallback-models.json'
import type { AIProvider, ChatRequest, ModelInfo, ProviderConfig } from './types'
import { log } from '../logger'

/**
 * Meta Muse Spark via the Meta Model API. As documented at build time it is
 * OpenAI-compatible (Responses API) at https://api.meta.ai/v1. The base URL and auth
 * header are editable in the provider card in case Meta changes them.
 */
export const META_DEFAULT_BASE = 'https://api.meta.ai/v1'

export class MetaProvider implements AIProvider {
  id: string
  displayName = 'Meta Muse Spark'
  authKind = 'apiKey' as const
  private o: ResponsesClientOpts
  constructor(private cfg: ProviderConfig) {
    this.id = cfg.connectionId
    const header = String(cfg.extra?.authHeader || 'authorization')
    const prefix = cfg.extra?.authPrefix === undefined ? 'Bearer ' : String(cfg.extra.authPrefix)
    this.o = {
      name: 'Meta Muse Spark',
      baseUrl: cfg.baseUrl || META_DEFAULT_BASE,
      auth: async () => ({ header, value: `${prefix}${cfg.apiKey ?? ''}` }),
      supportsWebSearch: false
    }
  }
  private async authHeaders(): Promise<Record<string, string>> {
    const a = await this.o.auth()
    return { [a.header]: a.value }
  }
  async testConnection() {
    if (!this.cfg.apiKey)
      return { ok: false, message: 'Paste your Meta Model API key first, then click Test.' }
    try {
      const models = await this.listModels()
      // The model list may be the built-in fallback, so prove the key with a tiny request.
      await this.chat({
        model: models[0].id,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        maxOutputTokens: 16
      })
      return { ok: true, message: `Connected. ${models.length} models available.` }
    } catch (e) {
      return { ok: false, message: providerError('Meta', e).message }
    }
  }
  async listModels(): Promise<ModelInfo[]> {
    try {
      const list = await listOpenAIStyleModels(this.o.baseUrl, await this.authHeaders())
      if (list.length)
        return list.map(({ id }) => ({ id, label: id, capabilities: mergeCaps(undefined, id) }))
    } catch (e) {
      log.warn('Meta list models failed; using fallback list', e)
    }
    return (fallback.meta as string[]).map((id) => ({
      id,
      label: id,
      capabilities: mergeCaps(undefined, id)
    }))
  }
  async chat(req: ChatRequest, onToken?: (t: string) => void) {
    try {
      return await responsesChat(this.o, req, onToken)
    } catch (e) {
      throw providerError('Meta', e)
    }
  }
}

import {
  responsesChat,
  openaiImages,
  listOpenAIStyleModels,
  type ResponsesClientOpts
} from './openai-responses'
import { providerError } from './base'
import { mergeCaps, shouldHide } from './capabilities'
import type { AIProvider, ChatRequest, ImageRequest, ModelInfo, ProviderConfig } from './types'

/** xAI Grok. xAI's API follows OpenAI's shape, including the Responses API with web search. */
export class XAIProvider implements AIProvider {
  id: string
  displayName = 'xAI Grok'
  authKind = 'apiKey' as const
  private o: ResponsesClientOpts
  constructor(private cfg: ProviderConfig) {
    this.id = cfg.connectionId
    this.o = {
      name: 'xAI Grok',
      baseUrl: cfg.baseUrl || 'https://api.x.ai/v1',
      auth: async () => ({ header: 'authorization', value: `Bearer ${cfg.apiKey ?? ''}` }),
      supportsWebSearch: true
    }
  }
  async testConnection() {
    if (!this.cfg.apiKey) return { ok: false, message: 'Paste your xAI API key first, then click Test.' }
    try {
      const m = await this.listModels()
      return { ok: true, message: `Connected. ${m.length} models available.` }
    } catch (e) {
      return { ok: false, message: providerError('xAI', e).message }
    }
  }
  async listModels(): Promise<ModelInfo[]> {
    try {
      const list = await listOpenAIStyleModels(this.o.baseUrl, {
        authorization: `Bearer ${this.cfg.apiKey ?? ''}`
      })
      return list.map(({ id }) => ({
        id,
        label: id,
        capabilities: mergeCaps(undefined, id),
        hidden: shouldHide(id)
      }))
    } catch (e) {
      throw providerError('xAI', e)
    }
  }
  async chat(req: ChatRequest, onToken?: (t: string) => void) {
    try {
      return await responsesChat(this.o, req, onToken)
    } catch (e) {
      throw providerError('xAI', e)
    }
  }
  async generateImage(req: ImageRequest) {
    try {
      return await openaiImages(this.o, req)
    } catch (e) {
      throw providerError('xAI', e)
    }
  }
}

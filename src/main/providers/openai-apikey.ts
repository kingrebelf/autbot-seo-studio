import {
  responsesChat,
  openaiImages,
  listOpenAIStyleModels,
  type ResponsesClientOpts
} from './openai-responses'
import { providerError } from './base'
import { mergeCaps, shouldHide } from './capabilities'
import type { AIProvider, ChatRequest, ImageRequest, ModelInfo, ProviderConfig } from './types'

export class OpenAIProvider implements AIProvider {
  id: string
  displayName = 'OpenAI'
  authKind = 'apiKey' as const
  private o: ResponsesClientOpts
  constructor(private cfg: ProviderConfig) {
    this.id = cfg.connectionId
    this.o = {
      name: 'OpenAI',
      baseUrl: cfg.baseUrl || 'https://api.openai.com/v1',
      auth: async () => ({ header: 'authorization', value: `Bearer ${cfg.apiKey ?? ''}` }),
      supportsTemperature: true,
      supportsWebSearch: true
    }
  }
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.cfg.apiKey) return { ok: false, message: 'Paste your OpenAI API key first, then click Test.' }
    try {
      const m = await this.listModels()
      return { ok: true, message: `Connected. ${m.filter((x) => !x.hidden).length} models available.` }
    } catch (e) {
      return { ok: false, message: providerError('OpenAI', e).message }
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
      throw providerError('OpenAI', e)
    }
  }
  async chat(req: ChatRequest, onToken?: (t: string) => void) {
    // Reasoning models (o-series, gpt-5+) reject temperature.
    const noTemp = /^(o\d|gpt-5|gpt-6)/i.test(req.model)
    try {
      return await responsesChat({ ...this.o, supportsTemperature: !noTemp }, req, onToken)
    } catch (e) {
      throw providerError('OpenAI', e)
    }
  }
  async generateImage(req: ImageRequest) {
    try {
      return await openaiImages(this.o, req)
    } catch (e) {
      throw providerError('OpenAI', e)
    }
  }
}

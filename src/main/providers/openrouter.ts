import { OpenAICompatibleProvider } from './openai-compatible'
import { fetchWithRetry } from '../http'
import { mergeCaps, shouldHide } from './capabilities'
import { UserError } from '../errors'
import type { Capability } from '@shared/types'
import type { ImageRequest, ModelInfo, ProviderConfig } from './types'

/** OpenRouter: one key, models from every company. Its model list includes pricing. */
export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(cfg: ProviderConfig) {
    super({
      id: cfg.connectionId,
      displayName: 'OpenRouter',
      baseUrl: cfg.baseUrl || 'https://openrouter.ai/api/v1',
      apiKey: cfg.apiKey,
      authKind: 'apiKey',
      webSearchBody: { plugins: [{ id: 'web' }] },
      extraHeaders: {
        'HTTP-Referer': 'https://github.com/autbot/autbot-seo-studio',
        'X-Title': 'Autbot SEO Studio'
      }
    })
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.o.apiKey) return { ok: false, message: 'Paste your OpenRouter API key first, then click Test.' }
    try {
      // /models is public, so check the key itself.
      await fetchWithRetry(this.url('/key'), { headers: this.headers(), retries: 2, timeoutMs: 30_000 })
      const m = await this.listModels()
      return { ok: true, message: `Connected. ${m.length} models available.` }
    } catch (e) {
      return { ok: false, message: this.explain(e).message }
    }
  }

  protected toModelInfo(m: Record<string, unknown>): ModelInfo {
    const id = String(m.id)
    const arch = (m.architecture ?? {}) as { input_modalities?: string[]; output_modalities?: string[] }
    const params = (m.supported_parameters ?? []) as string[]
    const pricing = (m.pricing ?? {}) as { prompt?: string; completion?: string; image?: string }
    const caps = new Set<Capability>()
    if (arch.output_modalities?.includes('text') ?? true) caps.add('text')
    if (arch.input_modalities?.includes('image')) caps.add('vision')
    if (arch.output_modalities?.includes('image')) caps.add('imageGen')
    if (params.includes('structured_outputs') || params.includes('response_format')) caps.add('json')
    if (params.includes('tools')) caps.add('toolUse')
    if (caps.has('text')) caps.add('webSearch') // via OpenRouter's web plugin
    const ctx = typeof m.context_length === 'number' ? m.context_length : undefined
    if (ctx && ctx >= 128_000) caps.add('longContext')
    const perM = (v?: string) =>
      v !== undefined && v !== '' && Number(v) >= 0 ? Number(v) * 1_000_000 : undefined
    return {
      id,
      label: String(m.name ?? id),
      capabilities: caps.size ? [...caps] : mergeCaps(undefined, id),
      contextWindow: ctx,
      inputPricePerMTok: perM(pricing.prompt),
      outputPricePerMTok: perM(pricing.completion),
      hidden: shouldHide(id)
    }
  }

  async generateImage(req: ImageRequest): Promise<{ images: Buffer[]; costUsd?: number }> {
    try {
      const images: Buffer[] = []
      let costUsd = 0
      for (let i = 0; i < (req.n ?? 1); i++) {
        const res = await fetchWithRetry(this.url('/chat/completions'), {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({
            model: req.model,
            modalities: ['image', 'text'],
            messages: [{ role: 'user', content: `${req.prompt}\n\nImage size: ${req.size}` }]
          }),
          signal: req.signal,
          timeoutMs: 300_000
        })
        const j = (await res.json()) as {
          choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[]
          usage?: { cost?: number }
        }
        costUsd += j.usage?.cost ?? 0
        for (const img of j.choices?.[0]?.message?.images ?? []) {
          const url = img.image_url?.url ?? ''
          const m = url.match(/^data:[^;]+;base64,(.*)$/)
          if (m) images.push(Buffer.from(m[1], 'base64'))
        }
      }
      if (!images.length)
        throw new UserError("OpenRouter didn't return an image. Pick an image-capable model, or try again.")
      return { images, costUsd: costUsd || undefined }
    } catch (e) {
      throw this.explain(e)
    }
  }
}

import { fetchWithRetry, readSSE } from '../http'
import { UserError } from '../errors'
import { providerError, parseJsonLoose, systemWithJson } from './base'
import { mergeCaps, shouldHide } from './capabilities'
import type { AIProvider, ChatRequest, ChatResult, ImageRequest, ModelInfo, ProviderConfig } from './types'
import type { Capability } from '@shared/types'

/** Google Gemini via the Gemini API (key from Google AI Studio). */
export class GeminiProvider implements AIProvider {
  id: string
  displayName = 'Google Gemini'
  authKind = 'apiKey' as const
  private base: string
  constructor(private cfg: ProviderConfig) {
    this.id = cfg.connectionId
    this.base = (cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')
  }
  private headers(): Record<string, string> {
    return { 'x-goog-api-key': this.cfg.apiKey ?? '', 'content-type': 'application/json' }
  }
  async testConnection() {
    if (!this.cfg.apiKey)
      return { ok: false, message: 'Paste your Gemini API key from Google AI Studio first, then click Test.' }
    try {
      const m = await this.listModels()
      return { ok: true, message: `Connected. ${m.filter((x) => !x.hidden).length} models available.` }
    } catch (e) {
      return { ok: false, message: providerError('Gemini', e).message }
    }
  }
  async listModels(): Promise<ModelInfo[]> {
    try {
      const out: ModelInfo[] = []
      let pageToken = ''
      for (let i = 0; i < 10; i++) {
        const q = new URLSearchParams({ pageSize: '1000' })
        if (pageToken) q.set('pageToken', pageToken)
        const res = await fetchWithRetry(`${this.base}/models?${q}`, {
          headers: this.headers(),
          retries: 2,
          timeoutMs: 30_000
        })
        const j = (await res.json()) as {
          models?: {
            name: string
            displayName?: string
            inputTokenLimit?: number
            supportedGenerationMethods?: string[]
            description?: string
          }[]
          nextPageToken?: string
        }
        for (const m of j.models ?? []) {
          if (!m.supportedGenerationMethods?.includes('generateContent')) continue
          const id = m.name.replace(/^models\//, '')
          const isImage = /image/i.test(id)
          const caps: Capability[] = isImage
            ? ['text', 'imageGen', 'vision']
            : ['text', 'json', 'vision', 'webSearch', 'toolUse']
          if ((m.inputTokenLimit ?? 0) >= 128_000 && !isImage) caps.push('longContext')
          out.push({
            id,
            label: m.displayName ?? id,
            capabilities: mergeCaps(caps, id),
            contextWindow: m.inputTokenLimit,
            hidden: shouldHide(id) || /deprecated/i.test(m.description ?? '')
          })
        }
        if (!j.nextPageToken) break
        pageToken = j.nextPageToken
      }
      return out
    } catch (e) {
      throw providerError('Gemini', e)
    }
  }

  async chat(req: ChatRequest, onToken?: (t: string) => void): Promise<ChatResult> {
    try {
      // Search grounding can't be combined with JSON mode on every model, so when both are
      // asked for we ground with search and ask for JSON in the prompt.
      const nativeJson = Boolean(req.jsonSchema) && !req.webSearch
      const sys = systemWithJson(req, nativeJson)
      const body: Record<string, unknown> = {
        contents: req.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts:
            typeof m.content === 'string'
              ? [{ text: m.content }]
              : m.content.map((p) =>
                  p.type === 'text'
                    ? { text: p.text }
                    : { inlineData: { mimeType: p.mimeType, data: p.dataBase64 } }
                )
        }))
      }
      if (sys) body.systemInstruction = { parts: [{ text: sys }] }
      const gen: Record<string, unknown> = {}
      if (req.temperature !== undefined) gen.temperature = req.temperature
      if (req.maxOutputTokens) gen.maxOutputTokens = req.maxOutputTokens
      if (nativeJson && req.jsonSchema) {
        gen.responseMimeType = 'application/json'
        gen.responseJsonSchema = req.jsonSchema
      }
      if (Object.keys(gen).length) body.generationConfig = gen
      if (req.webSearch) body.tools = [{ google_search: {} }]

      const res = await fetchWithRetry(
        `${this.base}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(body),
          signal: req.signal,
          timeoutMs: 600_000
        }
      )
      let text = ''
      const usage = { inputTokens: 0, outputTokens: 0 }
      const citations: { url: string; title?: string }[] = []
      let blocked = ''
      await readSSE(res, (data) => {
        let ev: Record<string, unknown>
        try {
          ev = JSON.parse(data) as Record<string, unknown>
        } catch {
          return
        }
        const cand = (ev.candidates as Record<string, unknown>[] | undefined)?.[0]
        for (const p of (cand?.content as { parts?: { text?: string; thought?: boolean }[] })?.parts ?? []) {
          if (p.text && !p.thought) {
            text += p.text
            onToken?.(p.text)
          }
        }
        const gm = cand?.groundingMetadata as
          { groundingChunks?: { web?: { uri?: string; title?: string } }[] } | undefined
        for (const c of gm?.groundingChunks ?? [])
          if (c.web?.uri && !citations.some((x) => x.url === c.web!.uri))
            citations.push({ url: c.web.uri, title: c.web.title })
        if (cand?.finishReason === 'SAFETY' || cand?.finishReason === 'PROHIBITED_CONTENT')
          blocked = String(cand.finishReason)
        const um = ev.usageMetadata as
          | { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
          | undefined
        if (um) {
          usage.inputTokens = um.promptTokenCount ?? usage.inputTokens
          usage.outputTokens = (um.candidatesTokenCount ?? 0) + (um.thoughtsTokenCount ?? 0)
        }
      })
      if (blocked && !text)
        throw new UserError(
          "Gemini's safety filter blocked this reply. Rephrase the topic or try a different model."
        )
      return { text, json: req.jsonSchema ? parseJsonLoose(text) : undefined, citations, usage }
    } catch (e) {
      throw providerError('Gemini', e)
    }
  }

  async generateImage(req: ImageRequest): Promise<{ images: Buffer[] }> {
    try {
      const aspect = req.size === '1536x1024' ? '3:2' : req.size === '1024x1536' ? '2:3' : '1:1'
      const images: Buffer[] = []
      for (let i = 0; i < (req.n ?? 1); i++) {
        const res = await fetchWithRetry(
          `${this.base}/models/${encodeURIComponent(req.model)}:generateContent`,
          {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
              generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'],
                imageConfig: { aspectRatio: aspect }
              }
            }),
            signal: req.signal,
            timeoutMs: 300_000
          }
        )
        const j = (await res.json()) as {
          candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[]
        }
        for (const p of j.candidates?.[0]?.content?.parts ?? [])
          if (p.inlineData?.data) images.push(Buffer.from(p.inlineData.data, 'base64'))
      }
      if (!images.length)
        throw new UserError("Gemini didn't return an image. Try again or change the prompt.")
      return { images }
    } catch (e) {
      throw providerError('Gemini', e)
    }
  }
}

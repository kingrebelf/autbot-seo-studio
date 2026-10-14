import { fetchWithRetry, readSSE, HttpError } from '../http'
import { UserError } from '../errors'
import { providerError, strictSchema, systemWithJson, parseJsonLoose } from './base'
import { mergeCaps, shouldHide } from './capabilities'
import type {
  AIProvider,
  ChatRequest,
  ChatResult,
  ContentPart,
  ImageRequest,
  ModelInfo,
  ProviderConfig
} from './types'
import type { Capability } from '@shared/types'

/**
 * Chat Completions client for anything that speaks the OpenAI-compatible API: LM Studio,
 * OpenRouter, custom endpoints.
 */
export interface CompatOpts {
  id: string
  displayName: string
  baseUrl: string
  apiKey?: string | null
  authKind: 'apiKey' | 'none'
  local?: boolean
  /** Extra body fields when web search is requested (OpenRouter: plugins). */
  webSearchBody?: Record<string, unknown>
  extraHeaders?: Record<string, string>
}

function toMessages(req: ChatRequest, nativeJson: boolean): unknown[] {
  const out: unknown[] = []
  const sys = systemWithJson(req, nativeJson)
  if (sys) out.push({ role: 'system', content: sys })
  for (const m of req.messages) {
    if (typeof m.content === 'string') out.push({ role: m.role, content: m.content })
    else
      out.push({
        role: m.role,
        content: m.content.map((p: ContentPart) =>
          p.type === 'text'
            ? { type: 'text', text: p.text }
            : { type: 'image_url', image_url: { url: `data:${p.mimeType};base64,${p.dataBase64}` } }
        )
      })
  }
  return out
}

export class OpenAICompatibleProvider implements AIProvider {
  id: string
  displayName: string
  authKind: 'apiKey' | 'none'
  constructor(protected o: CompatOpts) {
    this.id = o.id
    this.displayName = o.displayName
    this.authKind = o.authKind
  }

  protected headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json', ...(this.o.extraHeaders ?? {}) }
    if (this.o.apiKey) h.authorization = `Bearer ${this.o.apiKey}`
    return h
  }

  protected url(path: string): string {
    return `${this.o.baseUrl.replace(/\/$/, '')}${path}`
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (this.authKind === 'apiKey' && !this.o.apiKey)
      return { ok: false, message: 'Enter your API key first, then click Test.' }
    try {
      const models = await this.listModels()
      return { ok: true, message: `Connected. ${models.filter((m) => !m.hidden).length} models available.` }
    } catch (e) {
      return { ok: false, message: this.explain(e).message }
    }
  }

  protected explain(e: unknown): Error {
    if (
      this.o.local &&
      e instanceof Error &&
      /ECONNREFUSED|fetch failed/i.test(e.message + String(e.cause ?? ''))
    )
      return new UserError(
        `${this.displayName} isn't running at ${this.o.baseUrl}. Open ${this.displayName}, start its local server, then click Test.`
      )
    return providerError(this.displayName, e)
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetchWithRetry(this.url('/models'), {
        headers: this.headers(),
        retries: 2,
        timeoutMs: 30_000
      })
      const j = (await res.json()) as { data?: Record<string, unknown>[] }
      return (j.data ?? []).map((m) => this.toModelInfo(m))
    } catch (e) {
      throw this.explain(e)
    }
  }

  protected toModelInfo(m: Record<string, unknown>): ModelInfo {
    const id = String(m.id)
    return {
      id,
      label: String(m.name ?? m.id),
      capabilities: mergeCaps(undefined, id),
      contextWindow: typeof m.context_length === 'number' ? m.context_length : undefined,
      hidden: shouldHide(id),
      ...(this.o.local ? { inputPricePerMTok: 0, outputPricePerMTok: 0 } : {})
    }
  }

  async chat(req: ChatRequest, onToken?: (t: string) => void): Promise<ChatResult> {
    try {
      return await this.doChat(req, onToken, true)
    } catch (e) {
      // Some servers reject json_schema or stream_options: retry once in plain mode.
      if (
        e instanceof HttpError &&
        e.status === 400 &&
        /response_format|json_schema|stream_options/i.test(e.body)
      )
        try {
          return await this.doChat(req, onToken, false)
        } catch (e2) {
          throw this.explain(e2)
        }
      throw this.explain(e)
    }
  }

  protected async doChat(
    req: ChatRequest,
    onToken: ((t: string) => void) | undefined,
    rich: boolean
  ): Promise<ChatResult> {
    const nativeJson = Boolean(req.jsonSchema) && rich
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toMessages(req, nativeJson),
      stream: true
    }
    if (rich) body.stream_options = { include_usage: true }
    if (req.maxOutputTokens) body.max_tokens = req.maxOutputTokens
    if (req.temperature !== undefined) body.temperature = req.temperature
    if (nativeJson && req.jsonSchema)
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: 'result', schema: strictSchema(req.jsonSchema), strict: true }
      }
    if (req.webSearch && this.o.webSearchBody) Object.assign(body, this.o.webSearchBody)

    const res = await fetchWithRetry(this.url('/chat/completions'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: req.signal,
      timeoutMs: 600_000
    })
    let text = ''
    let usage = { inputTokens: 0, outputTokens: 0 }
    let costUsd: number | undefined
    const citations: { url: string; title?: string }[] = []
    await readSSE(res, (data) => {
      if (data === '[DONE]') return
      let ev: Record<string, unknown>
      try {
        ev = JSON.parse(data) as Record<string, unknown>
      } catch {
        return
      }
      if (ev.error) {
        const err = ev.error as { message?: string }
        throw new UserError(
          `${this.displayName} reported an error: ${err.message ?? 'unknown'}. Try again or pick another model.`
        )
      }
      const choice = (ev.choices as Record<string, unknown>[] | undefined)?.[0]
      const delta = (choice?.delta ?? choice?.message) as Record<string, unknown> | undefined
      if (delta?.content && typeof delta.content === 'string') {
        text += delta.content
        onToken?.(delta.content)
      }
      for (const an of (delta?.annotations as {
        type?: string
        url_citation?: { url: string; title?: string }
      }[]) ?? [])
        if (an.url_citation?.url) citations.push({ url: an.url_citation.url, title: an.url_citation.title })
      const u = ev.usage as { prompt_tokens?: number; completion_tokens?: number; cost?: number } | undefined
      if (u) {
        usage = { inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0 }
        if (typeof u.cost === 'number') costUsd = u.cost
      }
    })
    return { text, json: req.jsonSchema ? parseJsonLoose(text) : undefined, citations, usage, costUsd }
  }

  async generateImage(req: ImageRequest): Promise<{ images: Buffer[]; costUsd?: number }> {
    try {
      const body: Record<string, unknown> = {
        model: req.model,
        prompt: req.prompt,
        n: req.n ?? 1,
        response_format: 'b64_json',
        size: req.size
      }
      const res = await fetchWithRetry(this.url('/images/generations'), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: req.signal,
        timeoutMs: 300_000
      })
      const j = (await res.json()) as { data?: { b64_json?: string }[] }
      const images = (j.data ?? []).filter((d) => d.b64_json).map((d) => Buffer.from(d.b64_json!, 'base64'))
      if (!images.length)
        throw new UserError(`${this.displayName} didn't return an image. Try again or change the prompt.`)
      return { images }
    } catch (e) {
      throw this.explain(e)
    }
  }
}

export function createCompatible(cfg: ProviderConfig, kind: 'lmstudio' | 'custom'): OpenAICompatibleProvider {
  if (kind === 'lmstudio')
    return new OpenAICompatibleProvider({
      id: cfg.connectionId,
      displayName: 'LM Studio',
      baseUrl: cfg.baseUrl || 'http://127.0.0.1:1234/v1',
      authKind: 'none',
      local: true
    })
  return new OpenAICompatibleProvider({
    id: cfg.connectionId,
    displayName: String(cfg.extra?.name || 'Custom endpoint'),
    baseUrl: cfg.baseUrl || '',
    apiKey: cfg.apiKey,
    authKind: 'none',
    local: /127\.0\.0\.1|localhost/.test(cfg.baseUrl ?? '')
  })
}

export type { Capability }

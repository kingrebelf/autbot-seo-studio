import { fetchWithRetry, readSSE } from '../http'
import { UserError } from '../errors'
import { providerError, parseJsonLoose } from './base'
import { mergeCaps, shouldHide } from './capabilities'
import type { AIProvider, ChatRequest, ChatResult, ModelInfo, ProviderConfig } from './types'
import type { Capability } from '@shared/types'

const VERSION = '2023-06-01'

/** Anthropic Claude via the Messages API. JSON uses a forced "respond" tool. */
export class AnthropicProvider implements AIProvider {
  id: string
  displayName = 'Anthropic Claude'
  authKind = 'apiKey' as const
  private base: string
  constructor(private cfg: ProviderConfig) {
    this.id = cfg.connectionId
    this.base = (cfg.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')
  }
  private headers(): Record<string, string> {
    return {
      'x-api-key': this.cfg.apiKey ?? '',
      'anthropic-version': VERSION,
      'content-type': 'application/json'
    }
  }
  async testConnection() {
    if (!this.cfg.apiKey)
      return { ok: false, message: 'Paste your Anthropic API key first, then click Test.' }
    try {
      const m = await this.listModels()
      return { ok: true, message: `Connected. ${m.length} models available.` }
    } catch (e) {
      return { ok: false, message: providerError('Anthropic', e).message }
    }
  }
  async listModels(): Promise<ModelInfo[]> {
    try {
      const out: ModelInfo[] = []
      let after: string | undefined
      for (let page = 0; page < 10; page++) {
        const q = new URLSearchParams({ limit: '1000' })
        if (after) q.set('after_id', after)
        const res = await fetchWithRetry(`${this.base}/v1/models?${q}`, {
          headers: this.headers(),
          retries: 2,
          timeoutMs: 30_000
        })
        const j = (await res.json()) as {
          data: { id: string; display_name?: string; max_input_tokens?: number }[]
          has_more?: boolean
          last_id?: string
        }
        for (const m of j.data) {
          const caps: Capability[] = ['text', 'json', 'vision', 'webSearch', 'toolUse', 'longContext']
          out.push({
            id: m.id,
            label: m.display_name ?? m.id,
            capabilities: mergeCaps(caps, m.id),
            contextWindow: m.max_input_tokens ?? 200_000,
            hidden: shouldHide(m.id)
          })
        }
        if (!j.has_more) break
        after = j.last_id
      }
      return out
    } catch (e) {
      throw providerError('Anthropic', e)
    }
  }

  async chat(req: ChatRequest, onToken?: (t: string) => void): Promise<ChatResult> {
    try {
      return await this.doChat(req, onToken)
    } catch (e) {
      throw providerError('Anthropic', e)
    }
  }

  private async doChat(req: ChatRequest, onToken?: (t: string) => void): Promise<ChatResult> {
    const tools: unknown[] = []
    if (req.webSearch) tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 5 })
    let system = req.system ?? ''
    let toolChoice: unknown
    if (req.jsonSchema) {
      tools.push({
        name: 'respond',
        description: 'Return your final answer in this exact structure.',
        input_schema: req.jsonSchema
      })
      if (req.webSearch) {
        system +=
          '\n\nResearch with web search first if useful, then call the `respond` tool exactly once with your final answer.'
        toolChoice = { type: 'auto' }
      } else toolChoice = { type: 'tool', name: 'respond' }
    }
    const body: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxOutputTokens ?? 16000,
      stream: true,
      messages: req.messages.map((m) => ({
        role: m.role,
        content:
          typeof m.content === 'string'
            ? m.content
            : m.content.map((p) =>
                p.type === 'text'
                  ? { type: 'text', text: p.text }
                  : { type: 'image', source: { type: 'base64', media_type: p.mimeType, data: p.dataBase64 } }
              )
      }))
    }
    if (system) body.system = system
    if (req.temperature !== undefined) body.temperature = req.temperature
    if (tools.length) body.tools = tools
    if (toolChoice) body.tool_choice = toolChoice

    const res = await fetchWithRetry(`${this.base}/v1/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: req.signal,
      timeoutMs: 600_000
    })

    let text = ''
    const usage = { inputTokens: 0, outputTokens: 0 }
    const citations: { url: string; title?: string }[] = []
    const blocks: Record<number, { type: string; name?: string; json: string }> = {}
    let stopReason = ''
    await readSSE(res, (data) => {
      let ev: Record<string, unknown>
      try {
        ev = JSON.parse(data) as Record<string, unknown>
      } catch {
        return
      }
      switch (ev.type) {
        case 'message_start': {
          const u = (ev.message as { usage?: { input_tokens?: number; output_tokens?: number } }).usage
          usage.inputTokens += u?.input_tokens ?? 0
          usage.outputTokens += u?.output_tokens ?? 0
          break
        }
        case 'content_block_start': {
          const cb = ev.content_block as Record<string, unknown>
          blocks[ev.index as number] = {
            type: cb.type as string,
            name: cb.name as string | undefined,
            json: ''
          }
          if (cb.type === 'web_search_tool_result' && Array.isArray(cb.content))
            for (const r of cb.content as { url?: string; title?: string }[])
              if (r.url && !citations.some((c) => c.url === r.url))
                citations.push({ url: r.url, title: r.title })
          break
        }
        case 'content_block_delta': {
          const d = ev.delta as Record<string, unknown>
          const b = blocks[ev.index as number]
          if (d.type === 'text_delta') {
            text += d.text as string
            onToken?.(d.text as string)
          } else if (d.type === 'input_json_delta' && b) b.json += d.partial_json as string
          else if (d.type === 'citations_delta') {
            const c = d.citation as { url?: string; title?: string }
            if (c?.url && !citations.some((x) => x.url === c.url))
              citations.push({ url: c.url, title: c.title })
          }
          break
        }
        case 'message_delta': {
          const u = ev.usage as { output_tokens?: number } | undefined
          if (u?.output_tokens) usage.outputTokens = u.output_tokens
          stopReason = ((ev.delta as { stop_reason?: string })?.stop_reason ?? stopReason) as string
          break
        }
        case 'error': {
          const err = ev.error as { type?: string; message?: string }
          if (err?.type === 'overloaded_error')
            throw new UserError(
              'Anthropic is overloaded right now. Wait a minute and try again, or switch this task to another model.'
            )
          throw new UserError(
            `Anthropic reported an error: ${err?.message ?? 'unknown'}. Try again or pick another model.`
          )
        }
      }
    })

    let json: unknown
    if (req.jsonSchema) {
      const respond = Object.values(blocks).find((b) => b.type === 'tool_use' && b.name === 'respond')
      if (respond?.json) {
        try {
          json = JSON.parse(respond.json)
        } catch {
          json = undefined
        }
      }
      if (json === undefined) json = parseJsonLoose(text)
      if (json !== undefined && !text) text = JSON.stringify(json)
    }
    if (stopReason === 'refusal')
      throw new UserError(
        'Claude declined to answer this request. Rephrase the topic or try a different model.'
      )
    return { text, json, citations, usage }
  }
}

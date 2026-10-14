import { fetchWithRetry, readNDJSON } from '../http'
import { UserError } from '../errors'
import { providerError, parseJsonLoose } from './base'
import { mergeCaps } from './capabilities'
import type { AIProvider, ChatRequest, ChatResult, ModelInfo, ProviderConfig } from './types'
import type { Capability } from '@shared/types'

export const OLLAMA_NOT_RUNNING = "Ollama isn't running. Install it from ollama.com, then click Test."

/** Local models through Ollama. Free and private; may be slower and less accurate. */
export class OllamaProvider implements AIProvider {
  id: string
  displayName = 'Ollama (local)'
  authKind = 'none' as const
  private base: string
  constructor(cfg: ProviderConfig) {
    this.id = cfg.connectionId
    this.base = (cfg.baseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '')
  }
  private explain(e: unknown): Error {
    if (e instanceof Error && /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(e.message + String(e.cause ?? '')))
      return new UserError(OLLAMA_NOT_RUNNING, 'not_running')
    return providerError('Ollama', e)
  }
  async testConnection() {
    try {
      const m = await this.listModels()
      if (!m.length)
        return {
          ok: false,
          message:
            'Ollama is running but has no models yet. Open a terminal and run "ollama pull" with a model name from ollama.com/library, then click Test.'
        }
      return {
        ok: true,
        message: `Connected. ${m.length} local models available (free, private, may be slower and less accurate).`
      }
    } catch (e) {
      return { ok: false, message: this.explain(e).message }
    }
  }
  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetchWithRetry(`${this.base}/api/tags`, { retries: 1, timeoutMs: 10_000 })
      const j = (await res.json()) as { models?: { name: string; details?: { parameter_size?: string } }[] }
      const out: ModelInfo[] = []
      for (const m of j.models ?? []) {
        let caps: Capability[] = ['text', 'json']
        let ctx: number | undefined
        try {
          const s = await fetchWithRetry(`${this.base}/api/show`, {
            method: 'POST',
            body: JSON.stringify({ model: m.name }),
            retries: 1,
            timeoutMs: 10_000
          })
          const info = (await s.json()) as { capabilities?: string[]; model_info?: Record<string, unknown> }
          if (info.capabilities?.includes('vision')) caps.push('vision')
          if (info.capabilities?.includes('tools')) caps.push('toolUse')
          if (!info.capabilities?.includes('completion') && info.capabilities?.includes('embedding'))
            caps = []
          for (const [k, v] of Object.entries(info.model_info ?? {}))
            if (k.endsWith('.context_length') && typeof v === 'number') ctx = v
        } catch {
          caps = mergeCaps(undefined, m.name).filter((c) => c !== 'webSearch')
        }
        out.push({
          id: m.name,
          label: `${m.name}${m.details?.parameter_size ? ` (${m.details.parameter_size})` : ''} · Free, private, may be slower and less accurate`,
          capabilities: caps,
          contextWindow: ctx,
          inputPricePerMTok: 0,
          outputPricePerMTok: 0,
          hidden: caps.length === 0
        })
      }
      return out
    } catch (e) {
      throw this.explain(e)
    }
  }
  async chat(req: ChatRequest, onToken?: (t: string) => void): Promise<ChatResult> {
    try {
      const messages: unknown[] = []
      if (req.system) messages.push({ role: 'system', content: req.system })
      for (const m of req.messages) {
        if (typeof m.content === 'string') messages.push({ role: m.role, content: m.content })
        else
          messages.push({
            role: m.role,
            content: m.content
              .filter((p) => p.type === 'text')
              .map((p) => (p as { text: string }).text)
              .join('\n'),
            images: m.content
              .filter((p) => p.type === 'image')
              .map((p) => (p as { dataBase64: string }).dataBase64)
          })
      }
      const options: Record<string, unknown> = {}
      if (req.temperature !== undefined) options.temperature = req.temperature
      if (req.maxOutputTokens) options.num_predict = req.maxOutputTokens
      const body: Record<string, unknown> = { model: req.model, messages, stream: true, options }
      if (req.jsonSchema) body.format = req.jsonSchema
      const res = await fetchWithRetry(`${this.base}/api/chat`, {
        method: 'POST',
        body: JSON.stringify(body),
        signal: req.signal,
        timeoutMs: 1_800_000
      })
      let text = ''
      const usage = { inputTokens: 0, outputTokens: 0 }
      await readNDJSON(res, (o) => {
        if (o.error)
          throw new UserError(
            `Ollama reported an error: ${String(o.error)}. Check the model is installed, then try again.`
          )
        const c = (o.message as { content?: string } | undefined)?.content
        if (c) {
          text += c
          onToken?.(c)
        }
        if (o.done) {
          usage.inputTokens = Number(o.prompt_eval_count ?? 0)
          usage.outputTokens = Number(o.eval_count ?? 0)
        }
      })
      return { text, json: req.jsonSchema ? parseJsonLoose(text) : undefined, usage, costUsd: 0 }
    } catch (e) {
      throw this.explain(e)
    }
  }
}

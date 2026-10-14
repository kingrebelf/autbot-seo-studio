import { fetchWithRetry, readSSE, HttpError } from '../http'
import { UserError } from '../errors'
import { strictSchema, systemWithJson, parseJsonLoose } from './base'
import type { ChatRequest, ChatResult, ContentPart, ImageRequest } from './types'

/**
 * Shared client for OpenAI's Responses API. Used by the OpenAI API-key provider, the
 * ChatGPT plan provider, xAI and Meta (both expose the same API shape).
 */
export interface ResponsesClientOpts {
  name: string
  baseUrl: string
  /** Returns the full auth header (name + value). */
  auth: () => Promise<{ header: string; value: string }>
  supportsTemperature?: boolean
  supportsWebSearch?: boolean
  supportsJsonSchema?: boolean
  /** ChatGPT plan: `store: false`. */
  store?: boolean
  /** Convert a structured `error` from a failed stream into a user-facing error. */
  mapStreamError?: (code: string, message: string) => Error | null
}

function toInput(messages: ChatRequest['messages']): unknown[] {
  return messages.map((m) => {
    const parts: ContentPart[] =
      typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content
    return {
      role: m.role,
      content: parts.map((p) =>
        p.type === 'text'
          ? { type: m.role === 'assistant' ? 'output_text' : 'input_text', text: p.text }
          : { type: 'input_image', image_url: `data:${p.mimeType};base64,${p.dataBase64}` }
      )
    }
  })
}

export async function responsesChat(
  o: ResponsesClientOpts,
  req: ChatRequest,
  onToken?: (t: string) => void
): Promise<ChatResult> {
  const nativeJson = Boolean(req.jsonSchema) && o.supportsJsonSchema !== false
  const body: Record<string, unknown> = {
    model: req.model,
    input: toInput(req.messages),
    stream: true
  }
  const sys = systemWithJson(req, nativeJson)
  if (sys) body.instructions = sys
  if (o.store === false) body.store = false
  if (req.maxOutputTokens) body.max_output_tokens = req.maxOutputTokens
  if (req.temperature !== undefined && o.supportsTemperature !== false) body.temperature = req.temperature
  if (nativeJson && req.jsonSchema)
    body.text = {
      format: { type: 'json_schema', name: 'result', schema: strictSchema(req.jsonSchema), strict: true }
    }
  if (req.webSearch && o.supportsWebSearch !== false) body.tools = [{ type: 'web_search' }]

  const a = await o.auth()
  const res = await fetchWithRetry(`${o.baseUrl.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream', [a.header]: a.value },
    body: JSON.stringify(body),
    signal: req.signal,
    timeoutMs: 600_000
  })

  let text = ''
  let usage = { inputTokens: 0, outputTokens: 0 }
  const citations: { url: string; title?: string }[] = []
  let completed = false
  let failure: Error | null = null
  let finalOutput: unknown[] | null = null

  await readSSE(res, (data) => {
    if (data === '[DONE]') return
    let ev: Record<string, unknown>
    try {
      ev = JSON.parse(data) as Record<string, unknown>
    } catch {
      return
    }
    const type = ev.type as string
    if (type === 'response.output_text.delta') {
      const d = ev.delta as string
      text += d
      onToken?.(d)
    } else if (type === 'response.output_text.annotation.added') {
      const an = ev.annotation as { type?: string; url?: string; title?: string }
      if (an?.url) citations.push({ url: an.url, title: an.title })
    } else if (type === 'response.completed' || type === 'response.incomplete') {
      const r = ev.response as Record<string, unknown>
      const u = r?.usage as { input_tokens?: number; output_tokens?: number } | undefined
      if (u) usage = { inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 }
      finalOutput = (r?.output as unknown[]) ?? null
      completed = type === 'response.completed'
      if (type === 'response.incomplete' && !text)
        failure = new UserError(
          `${o.name} stopped before finishing (the reply was too long or was filtered). Try again, or pick a different model for this task.`
        )
    } else if (type === 'response.failed' || type === 'error') {
      const r = (ev.response as Record<string, unknown>) ?? ev
      const err =
        (r.error as { code?: string; message?: string }) ?? (ev as { code?: string; message?: string })
      const code = err?.code ?? ''
      const msg = err?.message ?? 'unknown error'
      failure =
        o.mapStreamError?.(code, msg) ??
        new UserError(
          `${o.name} reported an error: ${msg}. Try again, or pick a different model for this task.`
        )
    }
  })

  if (failure) throw failure
  // Pick up text and citations from the final output if no deltas arrived.
  if (finalOutput) {
    let finalText = ''
    for (const item of finalOutput as Record<string, unknown>[]) {
      if (item.type !== 'message') continue
      for (const c of (item.content as Record<string, unknown>[]) ?? []) {
        if (c.type === 'output_text') {
          finalText += c.text as string
          for (const an of (c.annotations as { url?: string; title?: string }[]) ?? [])
            if (an.url && !citations.some((x) => x.url === an.url))
              citations.push({ url: an.url, title: an.title })
        }
      }
    }
    if (!text) text = finalText
  }
  if (!completed && !text)
    throw new UserError(`${o.name} closed the connection before answering. Try again in a moment.`)

  return { text, json: req.jsonSchema ? parseJsonLoose(text) : undefined, citations, usage }
}

export async function openaiImages(o: ResponsesClientOpts, req: ImageRequest): Promise<{ images: Buffer[] }> {
  const a = await o.auth()
  const body: Record<string, unknown> = { model: req.model, prompt: req.prompt, n: req.n ?? 1 }
  if (/dall-e/i.test(req.model)) body.response_format = 'b64_json'
  if (/grok/i.test(req.model)) body.response_format = 'b64_json'
  else body.size = req.size
  const res = await fetchWithRetry(`${o.baseUrl.replace(/\/$/, '')}/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [a.header]: a.value },
    body: JSON.stringify(body),
    signal: req.signal,
    timeoutMs: 300_000
  })
  const j = (await res.json()) as { data?: { b64_json?: string; url?: string }[] }
  const images: Buffer[] = []
  for (const d of j.data ?? []) {
    if (d.b64_json) images.push(Buffer.from(d.b64_json, 'base64'))
    else if (d.url) {
      const r = await fetchWithRetry(d.url, { signal: req.signal })
      images.push(Buffer.from(await r.arrayBuffer()))
    }
  }
  if (!images.length)
    throw new UserError(`${o.name} didn't return an image. Try again, or change the image prompt.`)
  return { images }
}

/** GET /models in the OpenAI shape ({ data: [{ id }] }). */
export async function listOpenAIStyleModels(
  baseUrl: string,
  headers: Record<string, string>
): Promise<{ id: string; raw: Record<string, unknown> }[]> {
  const res = await fetchWithRetry(`${baseUrl.replace(/\/$/, '')}/models`, {
    headers,
    retries: 2,
    timeoutMs: 30_000
  })
  const j = (await res.json()) as { data?: Record<string, unknown>[]; models?: Record<string, unknown>[] }
  const list = j.data ?? j.models ?? []
  return list.map((m) => ({ id: String(m.id ?? m.slug ?? m.name), raw: m }))
}

export { HttpError }

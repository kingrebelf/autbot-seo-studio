import { rt } from './runtime'
import { userAgent } from '@shared/constants'
import { log, redact } from './logger'
import { CancelledError } from './errors'

export class HttpError extends Error {
  constructor(
    public status: number,
    public body: string,
    public url: string,
    public headers?: Headers
  ) {
    super(`HTTP ${status} from ${safeUrl(url)}: ${body.slice(0, 500)}`)
    this.name = 'HttpError'
  }
  /** Try to read a JSON error message from the body. Known secrets are scrubbed (some APIs echo keys back). */
  apiMessage(): string {
    return redact(this.rawApiMessage())
  }
  private rawApiMessage(): string {
    try {
      const j = JSON.parse(this.body) as Record<string, unknown>
      const e = j.error as Record<string, unknown> | string | undefined
      if (typeof e === 'string') return e
      if (e && typeof e.message === 'string') return e.message
      if (typeof j.message === 'string') return j.message
    } catch {
      /* not JSON */
    }
    return this.body.slice(0, 200)
  }
  apiCode(): string {
    try {
      const j = JSON.parse(this.body) as Record<string, unknown>
      const e = j.error as Record<string, unknown> | string | undefined
      if (typeof e === 'string') return e
      if (e && typeof e.code === 'string') return e.code
      if (e && typeof e.type === 'string') return e.type
      if (typeof j.code === 'string') return j.code
    } catch {
      /* not JSON */
    }
    return ''
  }
}

function safeUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.origin + u.pathname
  } catch {
    return url
  }
}

export function ua(): string {
  try {
    return userAgent(rt().appVersion)
  } catch {
    return userAgent('dev')
  }
}

export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError())
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new CancelledError())
      },
      { once: true }
    )
  })

export interface FetchOpts extends Omit<RequestInit, 'signal'> {
  retries?: number
  timeoutMs?: number
  signal?: AbortSignal | null
}

/**
 * fetch with a timeout and exponential backoff on 429/5xx (max 4 tries), honouring
 * `retry-after`. Throws HttpError for non-2xx responses.
 */
export async function fetchWithRetry(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { retries = 4, timeoutMs = 120_000, signal: sig, ...init } = opts
  const signal = sig ?? undefined
  let attempt = 0
  for (;;) {
    attempt++
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(new Error('Request timed out')), timeoutMs)
    const onAbort = (): void => ctrl.abort(new CancelledError())
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      if (signal?.aborted) throw new CancelledError()
      const res = await fetch(url, { ...init, signal: ctrl.signal })
      if (res.ok) return res
      const retryable = res.status === 429 || res.status >= 500
      const body = await res.text().catch(() => '')
      if (retryable && attempt < retries) {
        const ra = Number(res.headers.get('retry-after'))
        const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 60_000) : 500 * 2 ** (attempt - 1)
        log.warn(`HTTP ${res.status} from ${safeUrl(url)}, retrying in ${wait}ms`)
        await sleep(wait, signal)
        continue
      }
      throw new HttpError(res.status, body, url, res.headers)
    } catch (e) {
      if (signal?.aborted) throw new CancelledError()
      if (e instanceof HttpError) throw e
      if (attempt < retries && !(e instanceof CancelledError)) {
        await sleep(500 * 2 ** (attempt - 1), signal)
        continue
      }
      throw e
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
}

export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetchWithRetry(url, opts)
  return (await res.json()) as T
}

/** Read a server-sent-events stream, calling onEvent for each `data:` payload. */
export async function readSSE(res: Response, onEvent: (data: string, event?: string) => void): Promise<void> {
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let event: string | undefined
  let data: string[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '')
      buf = buf.slice(idx + 1)
      if (line === '') {
        if (data.length) onEvent(data.join('\n'), event)
        data = []
        event = undefined
      } else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      else if (line.startsWith('event:')) event = line.slice(6).trim()
    }
  }
  if (data.length) onEvent(data.join('\n'), event)
}

/** Read a newline-delimited JSON stream (Ollama). */
export async function readNDJSON(res: Response, onObj: (o: Record<string, unknown>) => void): Promise<void> {
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (line) onObj(JSON.parse(line) as Record<string, unknown>)
    }
  }
  if (buf.trim()) onObj(JSON.parse(buf) as Record<string, unknown>)
}

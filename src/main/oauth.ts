import { createServer, type Server } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { UserError } from './errors'
import { APP_NAME } from '@shared/constants'

export function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function pkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(48))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export const randomToken = (n = 24): string => base64url(randomBytes(n))

const page = (title: string, body: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${APP_NAME}</title><style>body{font-family:system-ui,sans-serif;max-width:520px;margin:80px auto;padding:0 16px;color:#222}h1{font-size:22px}</style></head><body><h1>${title}</h1><p>${body}</p></body></html>`

export interface Loopback {
  port: number
  redirectUri: string
  wait(signal?: AbortSignal, timeoutMs?: number): Promise<URLSearchParams>
  close(): void
}

/**
 * Start an HTTP listener on 127.0.0.1 (never "localhost") for an OAuth redirect.
 * Must be started BEFORE the browser is opened.
 */
export async function startLoopback(path: string, preferredPort = 0): Promise<Loopback> {
  let resolveFn: (p: URLSearchParams) => void = () => {}
  const got = new Promise<URLSearchParams>((r) => (resolveFn = r))
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== path) {
      res.writeHead(404).end()
      return
    }
    const ok = !url.searchParams.get('error')
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(
      ok
        ? page('You are signed in', `You can close this tab and go back to ${APP_NAME}.`)
        : page('Sign-in was cancelled', `You can close this tab and go back to ${APP_NAME} to try again.`)
    )
    resolveFn(url.searchParams)
  })
  const listen = (port: number): Promise<number> =>
    new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', reject)
        const addr = server.address()
        resolve(typeof addr === 'object' && addr ? addr.port : port)
      })
    })
  let port: number
  try {
    port = await listen(preferredPort)
  } catch {
    port = await listen(0)
  }
  const close = (): void => {
    server.close()
    server.closeAllConnections?.()
  }
  return {
    port,
    redirectUri: `http://127.0.0.1:${port}${path}`,
    close,
    wait: (signal, timeoutMs = 5 * 60_000) =>
      new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          close()
          reject(new UserError('Sign-in timed out. Click the sign-in button to try again.'))
        }, timeoutMs)
        signal?.addEventListener('abort', () => {
          clearTimeout(t)
          close()
          reject(new UserError('Sign-in was cancelled.'))
        })
        got.then((p) => {
          clearTimeout(t)
          setTimeout(close, 500)
          resolve(p)
        })
      })
  }
}

export function decodeJwt(token: string): {
  header: Record<string, unknown>
  payload: Record<string, unknown>
} {
  const [h, p] = token.split('.')
  const dec = (s: string) =>
    JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as Record<
      string,
      unknown
    >
  return { header: dec(h), payload: dec(p) }
}

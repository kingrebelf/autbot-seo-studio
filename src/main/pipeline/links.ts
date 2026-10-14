import { fetchWithRetry, HttpError, ua } from '../http'
import { analyze } from './html'

export interface LinkResult {
  href: string
  ok: boolean
  status: number | null
  note: string
}

/** Fetch every link in the draft (HEAD, then GET) to confirm it works. */
export async function checkLinks(html: string, siteUrl: string, signal?: AbortSignal): Promise<LinkResult[]> {
  const links = [...new Set(analyze(html, siteUrl).links.map((l) => l.href))].filter((h) =>
    /^https?:|^\//.test(h)
  )
  const out: LinkResult[] = []
  for (const href of links.slice(0, 60)) {
    const url = href.startsWith('/') ? `${siteUrl.replace(/\/$/, '')}${href}` : href
    let status: number | null = null
    try {
      let res: Response
      try {
        res = await fetchWithRetry(url, {
          method: 'HEAD',
          retries: 1,
          timeoutMs: 15_000,
          signal,
          headers: { 'user-agent': ua() },
          redirect: 'follow'
        })
      } catch (e) {
        if (e instanceof HttpError && (e.status === 405 || e.status === 403 || e.status === 404))
          res = await fetchWithRetry(url, {
            method: 'GET',
            retries: 1,
            timeoutMs: 20_000,
            signal,
            headers: { 'user-agent': ua() },
            redirect: 'follow'
          })
        else throw e
      }
      status = res.status
      out.push({ href, ok: true, status, note: 'Works' })
    } catch (e) {
      if (e instanceof HttpError) {
        status = e.status
        out.push({
          href,
          ok: false,
          status,
          note:
            e.status === 404
              ? 'Page not found (404). Fix or remove this link.'
              : `The site answered with error ${e.status}.`
        })
      } else out.push({ href, ok: false, status: null, note: "Couldn't reach this link. Check the address." })
    }
  }
  return out
}

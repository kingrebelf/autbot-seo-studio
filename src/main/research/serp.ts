import { fetchWithRetry, HttpError } from '../http'
import { getSecret } from '../secrets'
import { getSetting } from '../settings'
import { UserError } from '../errors'
import type { SerpItem } from './dataforseo'

export const SERPER_SECRET = 'datasource:serper'
export const BRAVE_SECRET = 'datasource:brave'

export function serpConfigured(): 'serper' | 'brave' | null {
  const p = getSetting('serpProvider')
  if (p === 'serper' && getSecret(SERPER_SECRET)) return 'serper'
  if (p === 'brave' && getSecret(BRAVE_SECRET)) return 'brave'
  return null
}

/** Top 10 results for a query from Serper.dev or the Brave Search API. */
export async function topResults(
  q: string,
  country = 'us',
  lang = 'en',
  signal?: AbortSignal,
  provider = serpConfigured()
): Promise<SerpItem[]> {
  try {
    if (provider === 'serper') {
      const res = await fetchWithRetry('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': getSecret(SERPER_SECRET) ?? '', 'content-type': 'application/json' },
        body: JSON.stringify({ q, gl: country.toLowerCase(), hl: lang, num: 10 }),
        signal,
        retries: 2
      })
      const j = (await res.json()) as {
        organic?: { title: string; link: string; snippet?: string; position: number }[]
      }
      return (j.organic ?? []).map((o) => ({
        position: o.position,
        url: o.link,
        title: o.title,
        snippet: o.snippet ?? ''
      }))
    }
    if (provider === 'brave') {
      const res = await fetchWithRetry(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10&country=${encodeURIComponent(country.toLowerCase())}`,
        {
          headers: { 'X-Subscription-Token': getSecret(BRAVE_SECRET) ?? '', accept: 'application/json' },
          signal,
          retries: 2
        }
      )
      const j = (await res.json()) as {
        web?: { results?: { title: string; url: string; description?: string }[] }
      }
      return (j.web?.results ?? []).map((o, i) => ({
        position: i + 1,
        url: o.url,
        title: o.title,
        snippet: (o.description ?? '').replace(/<[^>]+>/g, '')
      }))
    }
    return []
  } catch (e) {
    if (e instanceof HttpError && (e.status === 401 || e.status === 403))
      throw new UserError(
        `${provider === 'brave' ? 'Brave Search' : 'Serper'} rejected your key. Check it in Settings > Data Sources.`
      )
    throw e
  }
}

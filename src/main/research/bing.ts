import { fetchWithRetry, HttpError } from '../http'
import { getSecret } from '../secrets'
import { UserError } from '../errors'

export const BING_SECRET = 'datasource:bing'

export interface BingQuery {
  query: string
  impressions: number
  clicks: number
  position: number
  date: string
}

/** Query stats from Bing Webmaster Tools. */
export async function bingQueryStats(siteUrl: string, signal?: AbortSignal): Promise<BingQuery[]> {
  const key = getSecret(BING_SECRET)
  if (!key) return []
  try {
    const res = await fetchWithRetry(
      `https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats?siteUrl=${encodeURIComponent(siteUrl)}&apikey=${encodeURIComponent(key)}`,
      { signal, retries: 2 }
    )
    const j = (await res.json()) as {
      d?: {
        Query: string
        Impressions: number
        Clicks: number
        AvgImpressionPosition: number
        Date: string
      }[]
    }
    return (j.d ?? []).map((r) => {
      const ms = Number(r.Date.match(/\d+/)?.[0] ?? Date.now())
      return {
        query: r.Query,
        impressions: r.Impressions,
        clicks: r.Clicks,
        position: r.AvgImpressionPosition,
        date: new Date(ms).toISOString().slice(0, 10)
      }
    })
  } catch (e) {
    if (e instanceof HttpError && (e.status === 401 || e.status === 400))
      throw new UserError(
        'Bing Webmaster Tools rejected the key or site. Check the API key in Settings > Data Sources and that the site is verified in Bing.'
      )
    throw e
  }
}

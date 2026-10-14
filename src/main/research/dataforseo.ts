import { fetchWithRetry, HttpError } from '../http'
import { getSecret } from '../secrets'
import { getSetting } from '../settings'
import { UserError } from '../errors'

export const DFS_SECRET = 'datasource:dataforseo'

export const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  GB: 'United Kingdom',
  UK: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  NZ: 'New Zealand',
  IE: 'Ireland',
  DE: 'Germany',
  FR: 'France',
  ES: 'Spain',
  IT: 'Italy',
  NL: 'Netherlands',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  PL: 'Poland',
  PT: 'Portugal',
  BR: 'Brazil',
  MX: 'Mexico',
  IN: 'India',
  ZA: 'South Africa',
  SG: 'Singapore',
  JP: 'Japan'
}
export const countryName = (c: string) => COUNTRY_NAMES[c.toUpperCase()] ?? c

export function dataForSeoConfigured(): boolean {
  return Boolean(getSetting('dataforseoLogin') && getSecret(DFS_SECRET))
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const login = getSetting('dataforseoLogin')
  const pass = getSecret(DFS_SECRET)
  if (!login || !pass)
    throw new UserError(
      'DataForSEO is not connected. Add your login and password in Settings > Data Sources.'
    )
  try {
    const res = await fetchWithRetry(`https://api.dataforseo.com/v3${path}`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${login}:${pass}`).toString('base64')}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      signal,
      timeoutMs: 120_000
    })
    const j = (await res.json()) as {
      status_code: number
      status_message: string
      tasks?: { status_code: number; status_message: string; result?: unknown[] }[]
    }
    const t = j.tasks?.[0]
    if (j.status_code >= 40000 || (t && t.status_code >= 40000))
      throw new UserError(
        `DataForSEO said: ${t?.status_message ?? j.status_message}. Check your account balance and settings at dataforseo.com.`
      )
    return (t?.result ?? []) as T
  } catch (e) {
    if (e instanceof HttpError && e.status === 401)
      throw new UserError(
        'DataForSEO rejected your login. Check the login and API password in Settings > Data Sources.'
      )
    throw e
  }
}

export async function testDataForSeo(): Promise<{ ok: boolean; message: string }> {
  try {
    const login = getSetting('dataforseoLogin')
    const pass = getSecret(DFS_SECRET)
    const res = await fetchWithRetry('https://api.dataforseo.com/v3/appendix/user_data', {
      headers: { authorization: `Basic ${Buffer.from(`${login}:${pass}`).toString('base64')}` },
      retries: 1
    })
    const j = (await res.json()) as { tasks?: { result?: { money?: { balance?: number } }[] }[] }
    const bal = j.tasks?.[0]?.result?.[0]?.money?.balance
    return { ok: true, message: `Connected${bal !== undefined ? `. Balance: $${bal.toFixed(2)}` : ''}.` }
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof HttpError && e.status === 401
          ? 'DataForSEO rejected the login. Check the login and API password.'
          : "Couldn't reach DataForSEO. Check your internet connection and try again."
    }
  }
}

export async function searchVolume(
  keywords: string[],
  country: string,
  language: string,
  signal?: AbortSignal
) {
  const r = await post<{ keyword: string; search_volume: number | null; competition: string | null }[]>(
    '/keywords_data/google_ads/search_volume/live',
    [{ keywords: keywords.slice(0, 1000), location_name: countryName(country), language_name: language }],
    signal
  )
  return r.map((x) => ({ keyword: x.keyword, volume: x.search_volume, competition: x.competition }))
}

export async function keywordDifficulty(
  keywords: string[],
  country: string,
  language: string,
  signal?: AbortSignal
) {
  const r = await post<{ items?: { keyword: string; keyword_difficulty: number | null }[] }[]>(
    '/dataforseo_labs/google/bulk_keyword_difficulty/live',
    [{ keywords: keywords.slice(0, 1000), location_name: countryName(country), language_name: language }],
    signal
  )
  return (r[0]?.items ?? []).map((x) => ({ keyword: x.keyword, difficulty: x.keyword_difficulty }))
}

export interface SerpItem {
  position: number
  url: string
  title: string
  snippet: string
}

export async function serp(
  keyword: string,
  location: string,
  language: string,
  device: 'desktop' | 'mobile' = 'desktop',
  signal?: AbortSignal
): Promise<SerpItem[]> {
  const r = await post<
    { items?: { type: string; rank_group: number; url: string; title: string; description?: string }[] }[]
  >(
    '/serp/google/organic/live/regular',
    [
      {
        keyword,
        location_name: location.length <= 3 ? countryName(location) : location,
        language_name: language,
        device,
        depth: 100
      }
    ],
    signal
  )
  return (r[0]?.items ?? [])
    .filter((i) => i.type === 'organic')
    .map((i) => ({ position: i.rank_group, url: i.url, title: i.title, snippet: i.description ?? '' }))
}

/** Exact position of the site for a keyword (null if not in the top 100). */
export async function rankCheck(
  keyword: string,
  siteUrl: string,
  location: string,
  language: string,
  device: 'desktop' | 'mobile'
): Promise<{ position: number | null; url: string | null }> {
  const items = await serp(keyword, location, language, device)
  const h = new URL(siteUrl).hostname.replace(/^www\./, '')
  const hit = items.find((i) => {
    try {
      return new URL(i.url).hostname.replace(/^www\./, '') === h
    } catch {
      return false
    }
  })
  return { position: hit?.position ?? null, url: hit?.url ?? null }
}

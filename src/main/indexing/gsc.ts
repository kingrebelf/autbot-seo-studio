import { fetchWithRetry, fetchJson, HttpError } from '../http'
import { getSecret, getSecretJson, setSecretJson, deleteSecret, setSecret } from '../secrets'
import { getSetting, setSetting } from '../settings'
import { startLoopback, pkce, randomToken } from '../oauth'
import { rt } from '../runtime'
import { UserError } from '../errors'

/**
 * Google Search Console via OAuth 2.0 "installed app" flow (loopback redirect + PKCE).
 * The user supplies their own Google Cloud OAuth client ID (desktop type).
 */
export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters'
const TOKENS = 'google:tokens'
export const GOOGLE_CLIENT_SECRET = 'google:client_secret'
const API = 'https://www.googleapis.com/webmasters/v3'

interface GoogleTokens {
  access_token: string
  refresh_token: string
  expires_at: number
  scope: string
}

export function gscConnected(): boolean {
  return Boolean(getSecretJson<GoogleTokens>(TOKENS)?.refresh_token)
}

export function setGoogleClient(clientId: string, clientSecret?: string): void {
  setSetting('googleClientId', clientId.trim())
  if (clientSecret?.trim()) setSecret(GOOGLE_CLIENT_SECRET, clientSecret.trim())
}

function clientCreds(): { clientId: string; clientSecret: string | null } {
  const clientId = getSetting('googleClientId')
  if (!clientId)
    throw new UserError(
      'Add your Google OAuth client ID first (Settings > Google). docs/CONNECT-GOOGLE.md shows how to create one in a few minutes.'
    )
  return { clientId, clientSecret: getSecret(GOOGLE_CLIENT_SECRET) }
}

export async function connectGoogle(signal?: AbortSignal): Promise<void> {
  const { clientId, clientSecret } = clientCreds()
  const lb = await startLoopback('/oauth2callback')
  try {
    const { verifier, challenge } = pkce()
    const state = randomToken()
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: lb.redirectUri,
      response_type: 'code',
      scope: GSC_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    })
    await rt().openExternal(`https://accounts.google.com/o/oauth2/v2/auth?${q}`)
    const cb = await lb.wait(signal)
    if (cb.get('state') !== state)
      throw new UserError('The Google sign-in failed a security check. Try connecting again.')
    if (cb.get('error'))
      throw new UserError(
        `Google sign-in was cancelled or failed (${cb.get('error')}). Click Connect to try again.`
      )
    const body = new URLSearchParams({
      client_id: clientId,
      code: cb.get('code') ?? '',
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: lb.redirectUri
    })
    if (clientSecret) body.set('client_secret', clientSecret)
    let t: { access_token: string; refresh_token?: string; expires_in: number; scope: string }
    try {
      const res = await fetchWithRetry('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        retries: 2
      })
      t = (await res.json()) as typeof t
    } catch (e) {
      if (e instanceof HttpError && /client_secret/i.test(e.body))
        throw new UserError(
          'Google needs the client secret for this OAuth client. Paste it in Settings > Google (it comes with the client ID), then connect again.'
        )
      if (e instanceof HttpError && /invalid_client/i.test(e.body))
        throw new UserError(
          "Google didn't recognise the OAuth client ID. Check it's a Desktop app client, copied in full, then try again."
        )
      throw e
    }
    if (!t.refresh_token)
      throw new UserError(
        "Google didn't grant offline access. Remove the app's access at myaccount.google.com/permissions, then connect again."
      )
    if (!t.scope.includes(GSC_SCOPE))
      throw new UserError(
        'Search Console access was not granted. Connect again and tick the Search Console permission.'
      )
    setSecretJson(TOKENS, {
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: Date.now() + t.expires_in * 1000,
      scope: t.scope
    })
  } finally {
    lb.close()
  }
}

export function disconnectGoogle(): void {
  deleteSecret(TOKENS)
}

async function token(): Promise<string> {
  const t = getSecretJson<GoogleTokens>(TOKENS)
  if (!t) throw new UserError('Search Console is not connected. Connect it in Settings > Google.')
  if (t.expires_at - 60_000 > Date.now()) return t.access_token
  const { clientId, clientSecret } = clientCreds()
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: t.refresh_token,
    grant_type: 'refresh_token'
  })
  if (clientSecret) body.set('client_secret', clientSecret)
  try {
    const res = await fetchWithRetry('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      retries: 2
    })
    const n = (await res.json()) as { access_token: string; expires_in: number }
    setSecretJson(TOKENS, {
      ...t,
      access_token: n.access_token,
      expires_at: Date.now() + n.expires_in * 1000
    })
    return n.access_token
  } catch (e) {
    if (e instanceof HttpError && /invalid_grant/.test(e.body)) {
      deleteSecret(TOKENS)
      throw new UserError(
        'Your Google connection expired or was removed. Connect Search Console again in Settings > Google.'
      )
    }
    throw e
  }
}

async function gfetch<T>(
  url: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}
): Promise<T> {
  try {
    return await fetchJson<T>(url, {
      ...init,
      headers: {
        authorization: `Bearer ${await token()}`,
        'content-type': 'application/json',
        ...(init.headers ?? {})
      },
      retries: 3
    })
  } catch (e) {
    if (e instanceof HttpError && e.status === 403)
      throw new UserError(
        "Google says this account can't access that Search Console property. Pick a property you own in Settings > Google."
      )
    throw e
  }
}

export async function listProperties(): Promise<{ siteUrl: string; permissionLevel: string }[]> {
  const j = await gfetch<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(`${API}/sites`)
  return (j.siteEntry ?? []).filter((s) => s.permissionLevel !== 'siteUnverifiedUser')
}

export interface GscRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export async function searchAnalytics(
  property: string,
  opts: {
    startDate: string
    endDate: string
    dimensions: string[]
    rowLimit?: number
    startRow?: number
    filters?: { dimension: string; operator: string; expression: string }[]
  }
): Promise<GscRow[]> {
  const body: Record<string, unknown> = {
    startDate: opts.startDate,
    endDate: opts.endDate,
    dimensions: opts.dimensions,
    rowLimit: opts.rowLimit ?? 1000,
    startRow: opts.startRow ?? 0,
    dataState: 'final'
  }
  if (opts.filters?.length) body.dimensionFilterGroups = [{ filters: opts.filters }]
  const j = await gfetch<{ rows?: GscRow[] }>(
    `${API}/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: 'POST',
      body: JSON.stringify(body)
    }
  )
  return j.rows ?? []
}

/** All rows, following pagination (up to `max`). */
export async function searchAnalyticsAll(
  property: string,
  opts: Parameters<typeof searchAnalytics>[1],
  max = 100_000
): Promise<GscRow[]> {
  const out: GscRow[] = []
  for (let start = 0; start < max; start += 25_000) {
    const rows = await searchAnalytics(property, { ...opts, rowLimit: 25_000, startRow: start })
    out.push(...rows)
    if (rows.length < 25_000) break
  }
  return out
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10)
export const daysAgo = (n: number) => isoDate(new Date(Date.now() - n * 86_400_000))

export async function submitSitemap(property: string, sitemapUrl: string): Promise<void> {
  const t = await token()
  await fetchWithRetry(
    `${API}/sites/${encodeURIComponent(property)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
    {
      method: 'PUT',
      headers: { authorization: `Bearer ${t}` },
      retries: 3
    }
  )
}

export async function inspectUrl(
  property: string,
  url: string
): Promise<{ verdict: string; coverageState: string; lastCrawlTime?: string }> {
  const j = await gfetch<{
    inspectionResult?: {
      indexStatusResult?: { verdict?: string; coverageState?: string; lastCrawlTime?: string }
    }
  }>('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    body: JSON.stringify({ inspectionUrl: url, siteUrl: property })
  })
  const r = j.inspectionResult?.indexStatusResult ?? {}
  return {
    verdict: r.verdict ?? 'UNKNOWN',
    coverageState: r.coverageState ?? 'Unknown',
    lastCrawlTime: r.lastCrawlTime
  }
}

/**
 * Google does not allow requesting indexing for normal pages through its API, so the app
 * opens the Search Console URL Inspection page instead (the user clicks "Request indexing").
 */
export function inspectionUiUrl(property: string, url: string): string {
  return `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(property)}&id=${encodeURIComponent(url)}`
}

/** Pick the property that matches a site URL (domain property or URL-prefix). */
export function matchProperty(props: { siteUrl: string }[], siteUrl: string): string | null {
  const host = new URL(siteUrl).hostname.replace(/^www\./, '')
  const dom = props.find((p) => p.siteUrl === `sc-domain:${host}`)
  if (dom) return dom.siteUrl
  const pre = props.find((p) => {
    try {
      return new URL(p.siteUrl).hostname.replace(/^www\./, '') === host
    } catch {
      return false
    }
  })
  return pre?.siteUrl ?? null
}

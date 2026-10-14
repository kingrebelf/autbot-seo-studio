import { randomBytes } from 'node:crypto'
import { fetchWithRetry, HttpError } from '../http'
import { log } from '../logger'

/** IndexNow (Bing, Yandex and others): tell search engines a URL is new or changed. */
export function generateIndexNowKey(): string {
  return randomBytes(16).toString('hex')
}

export function keyFileName(key: string): string {
  return `${key}.txt`
}

export function keyLocation(siteUrl: string, key: string): string {
  return `${siteUrl.replace(/\/$/, '')}/${keyFileName(key)}`
}

export async function pingIndexNow(
  siteUrl: string,
  key: string,
  urls: string[]
): Promise<{ ok: boolean; message: string }> {
  if (!urls.length) return { ok: true, message: 'Nothing to submit.' }
  const host = new URL(siteUrl).hostname
  try {
    await fetchWithRetry('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: keyLocation(siteUrl, key), urlList: urls }),
      retries: 3
    })
    return { ok: true, message: `Sent ${urls.length} URL${urls.length === 1 ? '' : 's'} to IndexNow.` }
  } catch (e) {
    log.warn('IndexNow ping failed', e)
    if (e instanceof HttpError && e.status === 403)
      return {
        ok: false,
        message: `IndexNow couldn't find your key file at ${keyLocation(siteUrl, key)}. Upload it to your site (see Settings > Google), then try again.`
      }
    if (e instanceof HttpError && e.status === 422)
      return {
        ok: false,
        message:
          "IndexNow says the URL doesn't belong to your site. Check the site address in Settings > Sites."
      }
    return {
      ok: false,
      message: "Couldn't reach IndexNow. It will be tried again next time; check your connection."
    }
  }
}

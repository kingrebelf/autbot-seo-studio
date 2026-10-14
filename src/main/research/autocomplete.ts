import { fetchWithRetry, sleep, ua } from '../http'
import { log } from '../logger'

let last = 0
/** Global rate limit: 1 request per second to Google Autocomplete. */
async function throttle(signal?: AbortSignal): Promise<void> {
  const wait = last + 1000 - Date.now()
  if (wait > 0) await sleep(wait, signal)
  last = Date.now()
}

export async function suggest(q: string, hl = 'en', gl = 'us', signal?: AbortSignal): Promise<string[]> {
  await throttle(signal)
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(gl)}&q=${encodeURIComponent(q)}`
  try {
    const res = await fetchWithRetry(url, {
      headers: { 'user-agent': ua() },
      retries: 1,
      timeoutMs: 10_000,
      signal
    })
    const j = (await res.json()) as [string, string[]]
    return Array.isArray(j?.[1]) ? j[1] : []
  } catch (e) {
    log.warn('Autocomplete request failed', e)
    return []
  }
}

/** Real search phrases people type, for a seed topic. */
export async function expand(seed: string, hl = 'en', gl = 'us', signal?: AbortSignal): Promise<string[]> {
  const out = new Set<string>()
  for (const q of [seed, `${seed} cost`, `how ${seed}`, `best ${seed}`, `${seed} near`, `${seed} vs`]) {
    for (const s of await suggest(q, hl, gl, signal)) out.add(s)
  }
  return [...out].slice(0, 40)
}

export const LANGUAGE_CODES: Record<string, string> = {
  english: 'en',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  italian: 'it',
  portuguese: 'pt',
  dutch: 'nl',
  swedish: 'sv',
  danish: 'da',
  norwegian: 'no',
  finnish: 'fi',
  polish: 'pl',
  japanese: 'ja',
  chinese: 'zh',
  korean: 'ko'
}
export function langCode(language: string): string {
  return LANGUAGE_CODES[language.toLowerCase()] ?? (language.length === 2 ? language.toLowerCase() : 'en')
}

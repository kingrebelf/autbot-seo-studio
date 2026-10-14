import { fetchJson } from './http'
import { GITHUB_REPO } from '@shared/constants'

export function newer(a: string, b: string): boolean {
  const pa = a
    .replace(/^v/, '')
    .split(/[.-]/)
    .map((x) => Number(x) || 0)
  const pb = b
    .replace(/^v/, '')
    .split(/[.-]/)
    .map((x) => Number(x) || 0)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

/** Reads the GitHub Releases API. Never downloads or installs anything. */
export async function checkForUpdates(
  current: string
): Promise<{ available: boolean; latest: string | null; url: string | null; message: string }> {
  try {
    const r = await fetchJson<{ tag_name: string; html_url: string }>(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: { accept: 'application/vnd.github+json' },
        retries: 2,
        timeoutMs: 15_000
      }
    )
    const available = newer(r.tag_name, current)
    return {
      available,
      latest: r.tag_name,
      url: r.html_url,
      message: available
        ? `New version available: ${r.tag_name}`
        : `You're on the latest version (${current}).`
    }
  } catch {
    return {
      available: false,
      latest: null,
      url: null,
      message: "Couldn't check for updates right now. Check your internet connection and try again."
    }
  }
}

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, statSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fetchJson, fetchWithRetry } from './http'
import { rt } from './runtime'
import { log } from './logger'
import { UserError } from './errors'
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

interface ReleaseAsset {
  name: string
  size: number
  browser_download_url: string
}

export interface InstallerInfo {
  name: string
  size: number
  url: string
}

export interface UpdateInfo {
  available: boolean
  latest: string | null
  url: string | null
  /** The Windows setup file for the new version, when the app can install it for you. */
  installer: InstallerInfo | null
  message: string
}

/** Only installers attached to this project's own GitHub Releases are ever downloaded. */
const ASSET_PREFIX = `https://github.com/${GITHUB_REPO}/releases/download/`

/** The release asset this computer can install directly (Windows setup .exe only). */
export function pickInstaller(
  assets: ReleaseAsset[],
  platform: string = process.platform
): InstallerInfo | null {
  if (platform !== 'win32') return null
  const a = assets.find(
    (x) => /-setup\.exe$/i.test(x.name) && x.browser_download_url.startsWith(ASSET_PREFIX)
  )
  return a ? { name: a.name, size: a.size, url: a.browser_download_url } : null
}

/** Reads the GitHub Releases API. Nothing is downloaded until the user clicks install. */
export async function checkForUpdates(current: string): Promise<UpdateInfo> {
  try {
    const r = await fetchJson<{ tag_name: string; html_url: string; assets?: ReleaseAsset[] }>(
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
      installer: available ? pickInstaller(r.assets ?? []) : null,
      message: available
        ? `New version available: ${r.tag_name}`
        : `You're on the latest version (${current}).`
    }
  } catch {
    return {
      available: false,
      latest: null,
      url: null,
      installer: null,
      message: "Couldn't check for updates right now. Check your internet connection and try again."
    }
  }
}

/**
 * Windows: download the new setup file, run it silently over the current install and close the
 * app. The installer keeps the install folder and all data (websites, content, keys) and
 * re-opens the app when it finishes. Only runs when the user clicks "Install update".
 */
export async function downloadAndInstall(current: string): Promise<{ started: boolean; message: string }> {
  const u = await checkForUpdates(current)
  if (!u.available) return { started: false, message: u.message }
  if (!u.installer)
    throw new UserError(
      'This update has to be installed by hand on this computer. Click "Download" and run the new installer.'
    )
  const dir = join(tmpdir(), 'autbot-seo-studio-update')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const file = join(dir, u.installer.name)
  log.info(`Downloading update ${u.latest}`)
  const res = await fetchWithRetry(u.installer.url, { retries: 2, timeoutMs: 15 * 60_000 })
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  if (statSync(file).size !== u.installer.size)
    throw new UserError(
      "The update didn't download completely. Check your internet connection and try again."
    )
  // /S = silent upgrade in place; --force-run = start the app again when done.
  const child = spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' })
  child.unref()
  log.info(`Started installer for ${u.latest}; closing the app`)
  setTimeout(() => rt().quit?.(), 500)
  return { started: true, message: `Installing ${u.latest}. The app will close and open again by itself.` }
}

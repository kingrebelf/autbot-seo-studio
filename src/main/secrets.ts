import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { rt } from './runtime'
import { registerSecret } from './logger'
import { UserError } from './errors'

/**
 * Secrets (API keys, OAuth tokens, passwords) are encrypted with Electron safeStorage
 * (the OS keychain) and kept in their own file, never in the database. Backups and
 * exports skip this file.
 */
type Store = Record<string, string> // ref -> base64 ciphertext

function file(): string {
  return join(rt().dataDir, 'secrets.bin.json')
}

let cache: Store | null = null

function load(): Store {
  if (cache) return cache
  try {
    cache = existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Store) : {}
  } catch {
    cache = {}
  }
  return cache
}

function save(store: Store): void {
  mkdirSync(dirname(file()), { recursive: true })
  const tmp = file() + '.tmp'
  writeFileSync(tmp, JSON.stringify(store), { mode: 0o600 })
  renameSync(tmp, file())
  cache = store
}

export const SECRETS_FILENAME = 'secrets.bin.json'

export function setSecret(ref: string, value: string): void {
  const c = rt().cipher
  if (!c.available())
    throw new UserError(
      "Your computer's secure key storage isn't available, so the app can't save keys safely. On Linux, install and unlock a keyring (such as GNOME Keyring or KWallet), then restart the app."
    )
  const store = { ...load() }
  store[ref] = c.encrypt(value).toString('base64')
  registerSecret(value)
  save(store)
}

export function getSecret(ref: string | null | undefined): string | null {
  if (!ref) return null
  const v = load()[ref]
  if (!v) return null
  try {
    const plain = rt().cipher.decrypt(Buffer.from(v, 'base64'))
    registerSecret(plain)
    return plain
  } catch {
    return null
  }
}

export function getSecretJson<T>(ref: string): T | null {
  const s = getSecret(ref)
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

export function setSecretJson(ref: string, value: unknown): void {
  setSecret(ref, JSON.stringify(value))
}

export function hasSecret(ref: string): boolean {
  return Boolean(load()[ref])
}

export function deleteSecret(ref: string): void {
  const store = { ...load() }
  delete store[ref]
  save(store)
}

/** Load all secrets once at start-up so the logger can redact them. */
export function primeSecretRedaction(): void {
  for (const ref of Object.keys(load())) getSecret(ref)
}

export function resetSecretCache(): void {
  cache = null
}

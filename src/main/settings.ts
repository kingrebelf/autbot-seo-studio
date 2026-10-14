import { eq } from 'drizzle-orm'
import { getDb, schema } from './db'

/** App-wide (non-secret) settings stored in the `app_settings` table. */
export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  firstRunDone: boolean
  activeSiteId: number | null
  autocompleteEnabled: boolean
  crawlMaxPages: number
  jobConcurrency: number
  showAllModels: boolean
  googleClientId: string
  dataforseoLogin: string
  serpProvider: 'serper' | 'brave' | ''
  advanced: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  firstRunDone: false,
  activeSiteId: null,
  autocompleteEnabled: true,
  crawlMaxPages: 500,
  jobConcurrency: 2,
  showAllModels: false,
  googleClientId: '',
  dataforseoLogin: '',
  serpProvider: '',
  advanced: false
}

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  const row = getDb().select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).get()
  return (row?.value ?? DEFAULT_SETTINGS[key]) as AppSettings[K]
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  getDb()
    .insert(schema.appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: Date.now() } })
    .run()
}

export function getAllSettings(): AppSettings {
  const rows = getDb().select().from(schema.appSettings).all()
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value
  return out as unknown as AppSettings
}

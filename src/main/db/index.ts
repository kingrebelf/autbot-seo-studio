import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as schema from './schema'
import { migrate } from './migrate'
import { rt } from '../runtime'

export type DB = BetterSQLite3Database<typeof schema>

let sqlite: Database.Database | null = null
let db: DB | null = null

export const DB_FILENAME = 'autbot.db'

export function dbPath(): string {
  return join(rt().dataDir, DB_FILENAME)
}

export function openDb(path = dbPath()): DB {
  closeDb()
  mkdirSync(dirname(path), { recursive: true })
  sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  migrate(sqlite)
  db = drizzle(sqlite, { schema })
  return db
}

export function getDb(): DB {
  if (!db) return openDb()
  return db
}

export function rawDb(): Database.Database {
  if (!sqlite) openDb()
  return sqlite!
}

export function closeDb(): void {
  if (sqlite) {
    try {
      sqlite.close()
    } catch {
      /* already closed */
    }
  }
  sqlite = null
  db = null
}

export { schema }

import archiver from 'archiver'
import extract from 'extract-zip'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
  writeFileSync,
  mkdtempSync,
  renameSync
} from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { rt } from './runtime'
import { rawDb, closeDb, openDb, dbPath, DB_FILENAME } from './db'
import { readLogs } from './logger'
import { UserError } from './errors'
import { APP_NAME } from '@shared/constants'

/**
 * Backup = a zip of the database and images. Secrets (API keys, tokens, passwords) are
 * never included: they stay in the OS keychain-encrypted file on this computer.
 */
export async function backup(zipPath: string): Promise<string> {
  const tmp = mkdtempSync(join(tmpdir(), 'autbot-backup-'))
  const dbCopy = join(tmp, DB_FILENAME)
  await rawDb().backup(dbCopy)
  mkdirSync(dirname(zipPath), { recursive: true })
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(zipPath)
    const zip = archiver('zip', { zlib: { level: 6 } })
    out.on('close', () => resolve())
    zip.on('error', reject)
    zip.pipe(out)
    zip.file(dbCopy, { name: DB_FILENAME })
    const imgs = join(rt().dataDir, 'images')
    if (existsSync(imgs)) zip.directory(imgs, 'images')
    zip.append(
      `${APP_NAME} backup\nCreated ${new Date().toISOString()}\nContains the database and images. API keys and passwords are NOT included; reconnect them after restoring on a new computer.\n`,
      { name: 'README.txt' }
    )
    void zip.finalize()
  })
  rmSync(tmp, { recursive: true, force: true })
  return zipPath
}

export async function restore(zipPath: string): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), 'autbot-restore-'))
  try {
    await extract(zipPath, { dir: tmp })
    if (!existsSync(join(tmp, DB_FILENAME)))
      throw new UserError(
        "That file isn't an Autbot SEO Studio backup (no database inside). Pick a backup .zip made with Settings > About > Backup."
      )
    const data = rt().dataDir
    // keep a safety copy of the current database
    const current = dbPath()
    closeDb()
    if (existsSync(current)) renameSync(current, `${current}.before-restore-${Date.now()}`)
    for (const ext of ['-wal', '-shm']) if (existsSync(current + ext)) rmSync(current + ext)
    cpSync(join(tmp, DB_FILENAME), current)
    if (existsSync(join(tmp, 'images'))) {
      rmSync(join(data, 'images'), { recursive: true, force: true })
      cpSync(join(tmp, 'images'), join(data, 'images'), { recursive: true })
    }
    openDb()
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

export function exportLogs(dest: string): string {
  writeFileSync(dest, readLogs() || 'No log entries yet.\n')
  return dest
}

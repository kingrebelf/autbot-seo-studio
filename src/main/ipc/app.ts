import { z } from 'zod'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { route, none, siteIdInput, idInput } from './route'
import { rt } from '../runtime'
import { getAllSettings, setSetting, DEFAULT_SETTINGS, type AppSettings } from '../settings'
import { backup, restore, exportLogs } from '../backup'
import { checkForUpdates } from '../updates'
import { listNotifications, markNotificationsRead } from '../notify'
import { getDashboard, usageSummary, usageCsvRows } from '../dashboard'
import { listTemplates, saveTemplate, resetTemplate } from '../prompts'
import { listJobs, cancelJob, retryJob, continueJob, JOB_LABELS } from '../jobs/queue'
import { toCsv } from '../publish/export'
import { UserError } from '../errors'
import { APP_NAME } from '@shared/constants'
import { getDb, schema } from '../db'
import { eq } from 'drizzle-orm'

const settingKeys = Object.keys(DEFAULT_SETTINGS) as [keyof AppSettings, ...(keyof AppSettings)[]]

export const appRoutes = {
  'app.info': route(none, () => ({
    appName: APP_NAME,
    version: rt().appVersion,
    dataDir: rt().dataDir,
    devMode: rt().devMode,
    platform: process.platform
  })),
  'settings.get': route(none, () => getAllSettings()),
  'settings.set': route(z.object({ key: z.enum(settingKeys), value: z.unknown() }), ({ key, value }) => {
    setSetting(key, value as never)
    return getAllSettings()
  }),
  'app.openExternal': route(z.object({ url: z.string().url() }), async ({ url }) => {
    if (!/^https?:\/\//i.test(url)) throw new UserError('Only web links can be opened.')
    await rt().openExternal(url)
  }),
  'app.openDataFolder': route(none, async () => rt().openPath(rt().dataDir)),
  'app.backup': route(none, async () => {
    const dest = await rt().saveDialog({
      title: 'Save backup',
      defaultPath: `autbot-backup-${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: 'Zip', extensions: ['zip'] }]
    })
    if (!dest) return null
    return backup(dest)
  }),
  'app.restore': route(none, async () => {
    const [file] = await rt().openDialog({
      title: 'Choose a backup to restore',
      filters: [{ name: 'Zip', extensions: ['zip'] }]
    })
    if (!file) return false
    await restore(file)
    return true
  }),
  'app.exportLogs': route(none, async () => {
    const dest = await rt().saveDialog({
      title: 'Export logs',
      defaultPath: 'autbot-logs.txt',
      filters: [{ name: 'Text', extensions: ['txt'] }]
    })
    if (!dest) return null
    return exportLogs(dest)
  }),
  'app.checkUpdates': route(none, () => checkForUpdates(rt().appVersion)),
  'notifications.list': route(z.object({ siteId: z.number().nullable() }), ({ siteId }) =>
    listNotifications(siteId)
  ),
  'notifications.markRead': route(z.object({ siteId: z.number().nullable() }), ({ siteId }) =>
    markNotificationsRead(siteId)
  ),
  'dashboard.get': route(siteIdInput, ({ siteId }) => getDashboard(siteId)),
  'usage.summary': route(z.object({ month: z.string().optional() }), ({ month }) => usageSummary(month)),
  'usage.exportCsv': route(none, async () => {
    const dest = await rt().saveDialog({
      title: 'Export AI usage',
      defaultPath: 'ai-usage.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (!dest) return null
    writeFileSync(dest, toCsv(usageCsvRows()))
    return dest
  }),
  'prompts.list': route(none, () => listTemplates()),
  'prompts.save': route(z.object({ key: z.string(), body: z.string().min(1) }), ({ key, body }) =>
    saveTemplate(key, body)
  ),
  'prompts.reset': route(z.object({ key: z.string() }), ({ key }) => resetTemplate(key)),
  'jobs.list': route(z.object({ siteId: z.number().nullable().optional() }), ({ siteId }) =>
    listJobs(siteId ?? null).map((j) => ({ ...j, label: JOB_LABELS[j.type] ?? j.type }))
  ),
  'jobs.cancel': route(idInput, ({ id }) => cancelJob(id)),
  'jobs.retry': route(idInput, ({ id }) => retryJob(id)),
  'jobs.continue': route(
    z.object({ id: z.number(), budgetOverride: z.boolean().optional() }),
    ({ id, budgetOverride }) => continueJob(id, budgetOverride ? { budgetOverride: true } : {})
  ),
  'jobs.clearFinished': route(none, () => {
    getDb().delete(schema.jobs).where(eq(schema.jobs.status, 'done')).run()
  }),
  'app.defaultExportDir': route(none, () => join(rt().dataDir, 'exports'))
}

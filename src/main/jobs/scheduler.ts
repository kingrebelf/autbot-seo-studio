import cron from 'node-cron'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb, schema } from '../db'
import { enqueue } from './queue'
import { listSites, settingsOf } from '../sites'
import { wpConnected } from '../publish/wordpress'
import { gscConnected } from '../indexing/gsc'
import { dataForSeoConfigured } from '../research/dataforseo'
import { log } from '../logger'

const WEEK = 7 * 86_400_000

/** Avoid stacking duplicates of the same background job. */
function enqueueOnce(type: string, siteId: number, input: Record<string, unknown> = {}): void {
  const busy = getDb()
    .select()
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.type, type),
        eq(schema.jobs.siteId, siteId),
        inArray(schema.jobs.status, ['queued', 'running'])
      )
    )
    .get()
  if (!busy) enqueue({ type, siteId, input })
}

export function lastCrawl(siteId: number): number {
  const rows = getDb()
    .select({ t: schema.pages.lastCrawledAt })
    .from(schema.pages)
    .where(and(eq(schema.pages.siteId, siteId), eq(schema.pages.source, 'crawl')))
    .all()
  return rows.reduce((m, r) => Math.max(m, r.t ?? 0), 0)
}

export function runWpSync(): void {
  for (const s of listSites())
    if (
      wpConnected(s) &&
      getDb()
        .select()
        .from(schema.content)
        .where(and(eq(schema.content.siteId, s.id), eq(schema.content.status, 'Draft sent')))
        .get()
    )
      enqueueOnce('wp-sync', s.id)
}

export function runDaily(): void {
  for (const s of listSites()) {
    if (Date.now() - lastCrawl(s.id) > WEEK) enqueueOnce('crawl', s.id)
    if (settingsOf(s).gscProperty && gscConnected()) {
      enqueueOnce('gsc-pull', s.id)
      enqueueOnce('index-check', s.id)
    }
  }
}

export function runWeekly(): void {
  for (const s of listSites())
    if (dataForSeoConfigured() && (s.settings as { weeklyRankCheck?: boolean } | null)?.weeklyRankCheck)
      enqueueOnce('rank-check', s.id)
}

const tasks: ReturnType<typeof cron.schedule>[] = []

/** Background schedule. Runs only while the app is open. */
export function startScheduler(): void {
  tasks.push(cron.schedule('*/30 * * * *', () => safe(runWpSync)))
  tasks.push(cron.schedule('17 9 * * *', () => safe(runDaily)))
  tasks.push(cron.schedule('41 9 * * 1', () => safe(runWeekly)))
  // catch up shortly after start-up
  setTimeout(() => safe(runDaily), 60_000)
  setTimeout(() => safe(runWpSync), 90_000)
}

export function stopScheduler(): void {
  for (const t of tasks.splice(0)) void t.stop()
}

function safe(fn: () => void): void {
  try {
    fn()
  } catch (e) {
    log.error('Scheduled task failed', e)
  }
}

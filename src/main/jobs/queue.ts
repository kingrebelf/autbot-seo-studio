import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { getDb, schema } from '../db'
import { rt } from '../runtime'
import { log } from '../logger'
import { friendlyMessage, isAbort, CancelledError, UserError } from '../errors'
import { getSetting } from '../settings'
import type { JobCtx, JobHandler } from './types'
import type { JobStatus } from '@shared/types'

export type JobRow = typeof schema.jobs.$inferSelect

/** Job types that call AI models count toward the concurrency limit (default 2). */
const NON_AI = new Set([
  'crawl',
  'wp-import',
  'wp-sync',
  'gsc-pull',
  'rank-check',
  'index-check',
  'link-backs'
])

const handlers = new Map<string, JobHandler>()
const running = new Map<number, AbortController>()
let paused = false

export function registerHandler(type: string, h: JobHandler): void {
  handlers.set(type, h)
}

export const JOB_LABELS: Record<string, string> = {
  research: 'Research',
  brief: 'Content brief',
  write: 'Writing and checks',
  check: 'SEO pass and checks',
  refresh: 'Refresh a page',
  'mode-b': 'What should I do next?',
  'mode-c': 'Maintenance review',
  'mode-e': 'Plan a set',
  'mode-f': 'Plan local pages',
  'mode-g': 'Plan my next months',
  crawl: 'Crawl website',
  'wp-import': 'Read WordPress posts',
  'wp-sync': 'Check WordPress status',
  'gsc-pull': 'Pull Search Console data',
  'rank-check': 'Check rankings',
  images: 'Generate images',
  'index-check': 'Check index status',
  'link-backs': 'Add link-back drafts'
}

function emit(id: number): void {
  const j = getJob(id)
  if (!j) return
  try {
    rt().broadcast('jobs:update', j)
  } catch {
    /* no window */
  }
}

export function getJob(id: number): JobRow | undefined {
  return getDb().select().from(schema.jobs).where(eq(schema.jobs.id, id)).get()
}

function patch(id: number, p: Partial<typeof schema.jobs.$inferInsert>): void {
  getDb()
    .update(schema.jobs)
    .set({ ...p, updatedAt: Date.now() })
    .where(eq(schema.jobs.id, id))
    .run()
  emit(id)
}

export function enqueue(j: {
  type: string
  siteId?: number | null
  contentId?: number | null
  input?: Record<string, unknown>
}): JobRow {
  const row = getDb()
    .insert(schema.jobs)
    .values({
      type: j.type,
      siteId: j.siteId ?? null,
      contentId: j.contentId ?? null,
      input: j.input ?? {},
      output: {},
      status: 'queued',
      step: 'queued'
    })
    .returning()
    .get()
  emit(row.id)
  setImmediate(kick)
  return row
}

export function listJobs(siteId?: number | null, limit = 50): JobRow[] {
  const q = getDb().select().from(schema.jobs)
  return (siteId ? q.where(or(eq(schema.jobs.siteId, siteId), isNull(schema.jobs.siteId))) : q)
    .orderBy(desc(schema.jobs.id))
    .limit(limit)
    .all()
}

export function activeJobFor(contentId: number): JobRow | undefined {
  return getDb()
    .select()
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.contentId, contentId),
        inArray(schema.jobs.status, ['queued', 'running', 'waiting_for_user'])
      )
    )
    .orderBy(desc(schema.jobs.id))
    .get()
}

export function cancelJob(id: number): void {
  running.get(id)?.abort(new CancelledError())
  const j = getJob(id)
  if (j && j.status !== 'done' && j.status !== 'failed') patch(id, { status: 'cancelled', step: 'cancelled' })
}

export function retryJob(id: number): void {
  const j = getJob(id)
  if (!j) throw new UserError("That job couldn't be found.")
  patch(id, { status: 'queued', error: null, step: 'queued' })
  setImmediate(kick)
}

/** Continue a job that paused for the user (e.g. the budget guard), optionally adding input. */
export function continueJob(id: number, input: Record<string, unknown> = {}): void {
  const j = getJob(id)
  if (!j) throw new UserError("That job couldn't be found.")
  patch(id, { status: 'queued', error: null, input: { ...(j.input ?? {}), ...input }, step: 'queued' })
  setImmediate(kick)
}

/** Mark a waiting job as finished (the user moved on to the next step). */
export function finishWaiting(contentId: number): void {
  const rows = getDb()
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.contentId, contentId), eq(schema.jobs.status, 'waiting_for_user')))
    .all()
  for (const r of rows) if (r.step !== 'budget') patch(r.id, { status: 'done' })
}

/** Jobs that were running when the app quit become queued again. */
export function resumeAfterRestart(): number {
  const rows = getDb().select().from(schema.jobs).where(eq(schema.jobs.status, 'running')).all()
  for (const r of rows) patch(r.id, { status: 'queued', step: 'resumed after restart' })
  setImmediate(kick)
  return rows.length
}

export function pauseQueue(p: boolean): void {
  paused = p
  if (!p) setImmediate(kick)
}

let kicking = false
export function kick(): void {
  if (paused || kicking) return
  kicking = true
  try {
    const limit = Math.max(1, getSetting('jobConcurrency') || 2)
    const queued = getDb()
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, 'queued'))
      .orderBy(schema.jobs.id)
      .all()
    for (const j of queued) {
      if (running.has(j.id)) continue
      const aiRunning = [...running.keys()].filter((id) => !NON_AI.has(getJob(id)?.type ?? '')).length
      if (!NON_AI.has(j.type) && aiRunning >= limit) continue
      // one job at a time per piece of content
      if (j.contentId && [...running.keys()].some((id) => getJob(id)?.contentId === j.contentId)) continue
      void run(j)
    }
  } finally {
    kicking = false
  }
}

async function run(j: JobRow): Promise<void> {
  const h = handlers.get(j.type)
  if (!h) {
    patch(j.id, { status: 'failed', error: `Unknown job type ${j.type}.` })
    return
  }
  const ctrl = new AbortController()
  running.set(j.id, ctrl)
  patch(j.id, { status: 'running', step: 'starting', error: null })
  const output: Record<string, unknown> = { ...(j.output ?? {}) }
  const ctx: JobCtx = {
    jobId: j.id,
    siteId: j.siteId,
    contentId: j.contentId,
    signal: ctrl.signal,
    input: j.input ?? {},
    output,
    budgetOverride: Boolean((j.input ?? {}).budgetOverride),
    progress: (step, message) => patch(j.id, { step, progress: message ?? null }),
    token: (chunk) => {
      try {
        rt().broadcast('jobs:token', { jobId: j.id, contentId: j.contentId, chunk })
      } catch {
        /* no window */
      }
    },
    save: (p) => {
      Object.assign(output, p)
      patch(j.id, { output })
    }
  }
  try {
    const r = await h(ctx)
    if (getJob(j.id)?.status === 'cancelled') return
    const out = { ...output, ...(r.output ?? {}) }
    if (r.status === 'waiting_for_user')
      patch(j.id, { status: 'waiting_for_user', step: r.step, output: out, progress: null })
    else patch(j.id, { status: 'done', step: 'done', output: out, progress: null })
  } catch (e) {
    if (isAbort(e) || ctrl.signal.aborted) {
      patch(j.id, { status: 'cancelled', step: 'cancelled' })
    } else if (e instanceof UserError && e.code === 'budget') {
      patch(j.id, { status: 'waiting_for_user', step: 'budget', error: e.message })
    } else {
      log.error(`Job ${j.id} (${j.type}) failed`, e)
      patch(j.id, { status: 'failed', error: friendlyMessage(e) })
    }
  } finally {
    running.delete(j.id)
    setImmediate(kick)
  }
}

export function isRunning(id: number): boolean {
  return running.has(id)
}

export async function waitForIdle(timeoutMs = 60_000): Promise<void> {
  const start = Date.now()
  for (;;) {
    const busy = getDb()
      .select()
      .from(schema.jobs)
      .where(inArray(schema.jobs.status, ['queued', 'running'] as JobStatus[]))
      .all()
    if (!busy.length && !running.size) return
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for jobs')
    await new Promise((r) => setTimeout(r, 50))
  }
}

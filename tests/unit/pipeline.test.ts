import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  setupTestEnv,
  connectMock,
  waitForIdle,
  htmlResponse,
  stubWordPress,
  connectWordPress,
  makeContent,
  makeSite,
  SITE_URL,
  type TestEnv
} from './helpers'
import { dispatch, type ApiResult } from '../../src/main/ipc'
import { registerAllHandlers } from '../../src/main/jobs/handlers'
import { listJobs, getJob, resumeAfterRestart, enqueue } from '../../src/main/jobs/queue'
import { getContent, updateContent } from '../../src/main/content'
import { getDb, openDb, closeDb, schema } from '../../src/main/db'
import { getTaskAssignment } from '../../src/main/providers/registry'
import { upsertPage, parsePage } from '../../src/main/research/crawler'
import { TASKS } from '@shared/types'
import type { SiteRow } from '../../src/main/sites'

let env: TestEnv
beforeEach(() => {
  env = setupTestEnv()
  registerAllHandlers()
})
afterEach(() => env.cleanup())

function data<T>(r: ApiResult): T {
  if (!r.ok) throw new Error(`IPC failed: ${r.error}`)
  return r.data as T
}

/** Site created the way the wizard does it (crawl job included, network stubbed). */
async function wizardSite(): Promise<SiteRow> {
  env.fetch.on(`${SITE_URL}/`, () =>
    htmlResponse(
      `<html><head><title>Green Lawns Co</title></head><body><h1>Green Lawns Co</h1><p>${'We look after lawns in Springfield with mowing, feeding and seasonal care for busy homeowners. '.repeat(2)}</p></body></html>`
    )
  )
  const site = data<SiteRow>(
    await dispatch('sites.create', {
      name: 'Green Lawns Co',
      url: 'greenlawns.example',
      whatYouSell: 'Lawn care',
      serviceArea: 'Springfield',
      topServices: ['Aeration', 'Mowing']
    })
  )
  expect(site.url).toBe(SITE_URL)
  return site
}

async function startPiece(siteId: number, topic = 'spring lawn aeration'): Promise<number> {
  const id = data<number>(await dispatch('content.create', { siteId, topic }))
  await waitForIdle()
  return id
}

describe('Mode A end to end with the Mock provider (dev mode)', () => {
  it('research -> choose -> brief -> write -> checks -> Ready for review', async () => {
    const site = await wizardSite()

    // connect the mock provider: save + test + refresh models + auto-assign tasks
    const saved = data<{ id: string; ok: boolean; models: number }>(
      await dispatch('providers.save', { type: 'mock' })
    )
    expect(saved).toMatchObject({ id: 'mock', ok: true, models: 4 })
    expect(data<number>(await dispatch('providers.refreshModels', { id: 'mock' }))).toBe(4)
    for (const t of TASKS) expect(getTaskAssignment(t.key)?.providerId, t.key).toBe('mock')

    // Step 1-2: create + research
    const id = await startPiece(site.id)
    let c = getContent(id)
    expect(c.status).toBe('Awaiting choice')
    expect(c.mode).toBe('A')
    const research = c.research as {
      keyword_options: { keyword: string; volume: number | null; volume_source: string }[]
      recommendation: { keyword: string }
      data_sources: string[]
    }
    expect(research.keyword_options.length).toBeGreaterThanOrEqual(5)
    // the AI must never invent volumes
    expect(
      research.keyword_options.every((k) => k.volume === null && k.volume_source === 'ai_estimate')
    ).toBe(true)
    expect(research.data_sources).toContain('Your website')
    const researchJob = listJobs(site.id).find((j) => j.type === 'research')!
    expect(researchJob).toMatchObject({ status: 'waiting_for_user', step: 'choose' })
    // the crawl ran too
    expect(
      getDb()
        .select()
        .from(schema.pages)
        .where(eq(schema.pages.siteId, site.id))
        .all()
        .map((p) => p.url)
    ).toEqual([`${SITE_URL}/`])

    // Step 3: owner chooses
    const chosen = data<{ conflicts: unknown[] }>(
      await dispatch('content.choose', {
        contentId: id,
        keyword: research.recommendation.keyword,
        contentType: 'blog post',
        length: 'short'
      })
    )
    expect(chosen.conflicts).toEqual([])
    expect(getJob(researchJob.id)!.status).toBe('done')
    await waitForIdle()

    // Step 4: brief
    c = getContent(id)
    const brief = c.brief as { h1: string; outline: unknown[]; facts_needed: unknown[] }
    expect(brief.h1).toMatch(/spring lawn aeration/i)
    expect(brief.outline.length).toBeGreaterThan(2)
    expect(c.title).toBe(brief.h1)
    expect(c.focusKeyword).toBe('spring lawn aeration')
    expect(c.targetWords).toBeGreaterThan(0)
    expect(listJobs(site.id).find((j) => j.type === 'brief')).toMatchObject({
      status: 'waiting_for_user',
      step: 'brief'
    })

    // owner fills in a fact, then writes
    await dispatch('content.saveBrief', {
      contentId: id,
      outline: brief.outline,
      facts: { price: '$90 per yard' }
    })
    expect(data(await dispatch('content.write', { id }))).toBeUndefined()
    await waitForIdle()

    // Steps 5-9
    c = getContent(id)
    expect(c.status).toBe('Ready for review')
    expect(c.bodyHtml).toMatch(/<h2>/)
    expect(c.bodyHtml!.length).toBeGreaterThan(500)
    expect(c.seoTitle).toBeTruthy()
    expect(c.metaDescription).toBeTruthy()
    expect(c.slug).toBe('spring-lawn-aeration')
    expect(typeof c.seoScore).toBe('number')
    expect(c.seoScore).toBeGreaterThan(0)
    const checks = c.checks as {
      seo: { id: string; state: string }[]
      seoPass: unknown
      factCheck: { claims: unknown[] }
      links: unknown[]
    }
    expect(checks.seo).toHaveLength(19)
    expect(checks.seo.find((x) => x.id === 'schema')!.state).toBe('pass')
    expect(checks.seoPass).toBeTruthy()
    expect(checks.factCheck.claims.length).toBeGreaterThan(0)
    expect(Array.isArray(checks.links)).toBe(true)
    expect(c.schema).toBeTruthy()
    expect(listJobs(site.id).find((j) => j.type === 'write')!.status).toBe('done')
    // the first draft is saved in the history, and the owner is notified
    expect(data<unknown[]>(await dispatch('content.versions', { id })).length).toBeGreaterThan(0)
    expect(env.notifications.some((n) => n.title.startsWith('Ready for review'))).toBe(true)
    // usage was logged
    expect(getDb().select().from(schema.aiUsage).all().length).toBeGreaterThan(5)
    // the editor's view of the piece
    const full = data<{ unresolvedConfirms: string[]; activeJob: unknown }>(
      await dispatch('content.get', { id })
    )
    expect(full.activeJob).toBeNull()
    expect(env.fetch.unmatched.filter((u) => !u.url.startsWith(SITE_URL))).toEqual([])
  })
})

describe('[CONFIRM] placeholders block sending', () => {
  it('blocks with confirm_block until dismissed', async () => {
    const { created } = stubWordPress(env.fetch)
    const site = makeSite()
    connectWordPress(site.id)
    const c = makeContent(site.id, {
      bodyHtml:
        '<p>Lawn aeration costs [CONFIRM: price per yard] and we have done it for [CONFIRM: years] years.</p>'
    })

    const r = await dispatch('content.sendToWordPress', { id: c.id, force: true })
    expect(r).toMatchObject({ ok: false, code: 'confirm_block' })
    if (!r.ok) expect(r.error).toMatch(/2 facts still marked \[CONFIRM\].*Dismiss placeholders/)
    expect(env.fetch.calls).toHaveLength(0)
    expect(
      data<{ unresolvedConfirms: string[] }>(await dispatch('content.get', { id: c.id })).unresolvedConfirms
    ).toEqual(['price per yard', 'years'])

    const after = data<{ unresolvedConfirms: string[]; checks: { seo: { id: string; state: string }[] } }>(
      await dispatch('content.dismissConfirms', { id: c.id, removeText: false })
    )
    expect(after.unresolvedConfirms).toEqual([])
    expect(after.checks.seo.find((x) => x.id === 'confirm')!.state).toBe('warn')
    const ok = await dispatch('content.sendToWordPress', { id: c.id, force: true })
    expect(ok.ok).toBe(true)
    expect(created).toHaveLength(1)
  })

  it('blocks until the placeholders are resolved in the text', async () => {
    const { created } = stubWordPress(env.fetch)
    const site = makeSite()
    connectWordPress(site.id)
    const c = makeContent(site.id, { bodyHtml: '<p>We charge [CONFIRM: price].</p>' })
    expect(await dispatch('content.sendToWordPress', { id: c.id })).toMatchObject({
      ok: false,
      code: 'confirm_block'
    })
    await dispatch('content.update', { id: c.id, patch: { bodyHtml: '<p>We charge $90.</p>' } })
    expect(await dispatch('content.sendToWordPress', { id: c.id })).toMatchObject({ ok: true })
    expect(created).toHaveLength(1)
  })

  it('dismissing with removeText strips the placeholders', async () => {
    const site = makeSite()
    const c = makeContent(site.id, { bodyHtml: '<p>We charge [CONFIRM: price] per visit.</p>' })
    await dispatch('content.dismissConfirms', { id: c.id, removeText: true })
    expect(getContent(c.id).bodyHtml).toBe('<p>We charge  per visit.</p>')
  })
})

describe('cannibalization in content.choose', () => {
  it('returns conflicts for a keyword an existing page targets, and proceeds with force', async () => {
    await connectMock()
    const site = makeSite()
    upsertPage(site.id, {
      ...parsePage(
        '<html><head><title>Lawn Aeration Services</title></head><body><h1>Lawn Aeration</h1><p>We aerate.</p></body></html>',
        `${SITE_URL}/lawn-aeration/`,
        200
      ),
      focusKeyword: 'lawn aeration'
    })
    const id = await startPiece(site.id, 'lawn aeration')
    const research = getContent(id).research as {
      keyword_options: { keyword: string; cannibalization_risk: string | null }[]
    }
    // research already flags the risk on the matching keyword option
    expect(research.keyword_options.find((k) => k.keyword === 'lawn aeration')!.cannibalization_risk).toBe(
      `${SITE_URL}/lawn-aeration/`
    )

    const r = data<{ conflicts: { url: string; title: string }[] }>(
      await dispatch('content.choose', {
        contentId: id,
        keyword: 'Lawn Aeration',
        contentType: 'blog post',
        length: 'standard'
      })
    )
    expect(r.conflicts).toEqual([{ url: `${SITE_URL}/lawn-aeration/`, title: 'Lawn Aeration Services' }])
    await waitForIdle()
    expect(listJobs(site.id).some((j) => j.type === 'brief')).toBe(false)
    expect(getContent(id).focusKeyword).toBeNull()

    // a more specific keyword is fine
    const other = await startPiece(site.id, 'lawn aeration cost')
    expect(
      data<{ conflicts: unknown[] }>(
        await dispatch('content.choose', {
          contentId: other,
          keyword: 'lawn aeration cost',
          contentType: 'blog post',
          length: 'standard'
        })
      ).conflicts
    ).toEqual([])

    const forced = data<{ conflicts: unknown[] }>(
      await dispatch('content.choose', {
        contentId: id,
        keyword: 'lawn aeration',
        contentType: 'blog post',
        length: 'standard',
        force: true
      })
    )
    expect(forced.conflicts).toEqual([])
    await waitForIdle()
    expect(getContent(id).focusKeyword).toBe('lawn aeration')
    expect(listJobs(site.id).find((j) => j.type === 'brief' && j.contentId === id)!.status).toBe(
      'waiting_for_user'
    )
  })

  it('also catches another in-app piece with the same keyword', async () => {
    await connectMock()
    const site = makeSite()
    makeContent(site.id, {
      focusKeyword: 'spring lawn aeration',
      title: 'Spring lawn aeration guide',
      slug: 'spring-lawn-aeration'
    })
    const id = await startPiece(site.id, 'spring lawn aeration')
    const r = data<{ conflicts: { url: string }[] }>(
      await dispatch('content.choose', {
        contentId: id,
        keyword: 'spring lawn aeration',
        contentType: 'blog post',
        length: 'short'
      })
    )
    expect(r.conflicts.map((x) => x.url)).toEqual([`${SITE_URL}/spring-lawn-aeration`])
  })
})

describe('jobs resume after a force-quit', () => {
  it('a job left "running" is re-queued on start-up and completes, continuing where it stopped', async () => {
    await connectMock()
    const site = makeSite()
    const id = await startPiece(site.id)
    await dispatch('content.choose', {
      contentId: id,
      keyword: 'spring lawn aeration',
      contentType: 'blog post',
      length: 'short'
    })
    await waitForIdle()
    const partial =
      '<p>Intro written before the crash.</p>\n<h2>What is spring lawn aeration?</h2><p>Section written before the crash.</p>'
    updateContent(id, { status: 'Writing', bodyHtml: partial })

    // Simulate the app dying mid-job: a row stuck in "running" with 2 sections saved.
    const job = getDb()
      .insert(schema.jobs)
      .values({
        type: 'write',
        siteId: site.id,
        contentId: id,
        status: 'running',
        step: 'write',
        input: {},
        output: { sectionsDone: 2 }
      })
      .returning()
      .get()
    // "Restart": reopen the database and resume
    closeDb()
    openDb()
    expect(getJob(job.id)!.status).toBe('running')
    expect(resumeAfterRestart()).toBe(1)
    expect(getJob(job.id)!.status).toBe('queued')
    expect(getJob(job.id)!.step).toBe('resumed after restart')
    await waitForIdle()

    const done = getJob(job.id)!
    expect(done.status).toBe('done')
    const c = getContent(id)
    expect(c.status).toBe('Ready for review')
    // kept the work done before the crash and did not rewrite the intro
    expect(c.bodyHtml!.startsWith(partial)).toBe(true)
    expect(c.bodyHtml!.match(/written before the crash/g)).toHaveLength(2)
    expect(c.bodyHtml).toMatch(/Ready to get started\?|Frequently asked questions/)
    expect(resumeAfterRestart()).toBe(0)
  })

  it('cancelled and failed jobs are not resumed', async () => {
    const site = makeSite()
    const a = enqueue({ type: 'unknown-type', siteId: site.id })
    await waitForIdle()
    expect(getJob(a.id)!.status).toBe('failed')
    expect(resumeAfterRestart()).toBe(0)
    expect(getJob(a.id)!.status).toBe('failed')
  })
})

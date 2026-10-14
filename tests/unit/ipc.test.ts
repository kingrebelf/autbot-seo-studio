import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestEnv, makeSite, connectMock, waitForIdle, type TestEnv } from './helpers'
import { dispatch, routes } from '../../src/main/ipc'
import { registerAllHandlers } from '../../src/main/jobs/handlers'
import { getJob, listJobs } from '../../src/main/jobs/queue'
import { getDb, schema } from '../../src/main/db'
import { budgetGuard, BudgetPauseError } from '../../src/main/ai'
import { getSecret } from '../../src/main/secrets'
import { setRuntime, rt } from '../../src/main/runtime'
import { visibleMetas, saveConnection } from '../../src/main/providers/registry'
import { getContent } from '../../src/main/content'

let env: TestEnv
beforeEach(() => {
  env = setupTestEnv()
  registerAllHandlers()
})
afterEach(() => env.cleanup())

describe('IPC validation (zod) returns plain-English errors', () => {
  it('uses the schema message when one is written', async () => {
    const site = makeSite()
    const r = await dispatch('content.create', { siteId: site.id, topic: 'a' })
    expect(r).toEqual({ ok: false, error: 'Type a topic, product or service', code: 'invalid_input' })
  })

  it('names the field when the message is technical', async () => {
    const r = await dispatch('content.create', { topic: 'lawn care' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe('Please check the "siteId" field and try again.')
      expect(r.error).not.toMatch(/Invalid|Expected|undefined/)
    }
  })

  it('unknown routes and missing records give friendly messages, not stack traces', async () => {
    const unknown = await dispatch('nope.nothing', {})
    expect(unknown.ok).toBe(false)
    const missing = await dispatch('content.get', { id: 999 })
    expect(missing).toMatchObject({
      ok: false,
      error: 'That piece of content no longer exists. It may have been deleted.',
      code: 'user_error'
    })
  })

  it('every route has a zod input schema', () => {
    for (const [name, r] of Object.entries(routes)) {
      expect(typeof (r.input as { safeParse?: unknown }).safeParse, name).toBe('function')
      expect(typeof r.handler, name).toBe('function')
    }
  })

  it('rejects unknown site settings keys (strict)', async () => {
    const site = makeSite()
    const r = await dispatch('sites.update', { siteId: site.id, settings: { wpUser: 'sneaky' } })
    expect(r.ok).toBe(false)
  })

  it('sites.create validates and normalises the URL', async () => {
    const bad = await dispatch('sites.create', { name: '', url: 'x.example' })
    expect(bad).toMatchObject({ ok: false, error: 'Enter your business name' })
    env.fetch.on('https://shop.example', () => new Response('', { status: 404 }))
    const ok = await dispatch('sites.create', { name: 'Shop', url: 'shop.example/some/page' })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect((ok.data as { url: string }).url).toBe('https://shop.example')
  })
})

describe('mock provider is developer-only', () => {
  it('is hidden and refused outside dev mode', () => {
    expect(visibleMetas().some((m) => m.id === 'mock')).toBe(true)
    setRuntime({ ...rt(), devMode: false })
    expect(visibleMetas().some((m) => m.id === 'mock')).toBe(false)
    expect(() => saveConnection({ type: 'mock' })).toThrow(/developer mode/)
  })
})

describe('budget guard', () => {
  it('pauses a job that would pass the monthly cap, and continues when the owner says so', async () => {
    await connectMock()
    const site = makeSite()
    await dispatch('sites.update', { siteId: site.id, settings: { monthlyBudgetUsd: 0.01 } })
    getDb()
      .insert(schema.aiUsage)
      .values({
        siteId: site.id,
        providerId: 'mock',
        modelId: 'x',
        task: 'research',
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0.01
      })
      .run()
    const created = await dispatch('content.create', { siteId: site.id, topic: 'lawn aeration' })
    expect(created.ok).toBe(true)
    await waitForIdle()
    const job = listJobs(site.id).find((j) => j.type === 'research')!
    expect(job.status).toBe('waiting_for_user')
    expect(job.step).toBe('budget')
    expect(job.error).toMatch(/monthly cap/)
    expect(job.error).toMatch(/Continue anyway/)
    const cont = await dispatch('jobs.continue', { id: job.id, budgetOverride: true })
    expect(cont.ok).toBe(true)
    await waitForIdle()
    const after = getJob(job.id)!
    expect(after.status).toBe('waiting_for_user')
    expect(after.step).toBe('choose')
    expect(getContent(created.ok ? (created.data as number) : 0).status).toBe('Awaiting choice')
  })

  it('budgetGuard does nothing without a cap or with an override', async () => {
    await connectMock()
    const site = makeSite()
    const ref = { providerId: 'mock', modelId: getDb().select().from(schema.models).all()[0].modelId }
    expect(() => budgetGuard(ref, { siteId: site.id }, 1e9, 1e9)).not.toThrow()
    await dispatch('sites.update', { siteId: site.id, settings: { monthlyBudgetUsd: 1 } })
    expect(() => budgetGuard(ref, { siteId: site.id }, 1e9, 1e9)).toThrow(BudgetPauseError)
    expect(() => budgetGuard(ref, { siteId: site.id, budgetOverride: true }, 1e9, 1e9)).not.toThrow()
    expect(() => budgetGuard(ref, { siteId: site.id }, 10, 10)).not.toThrow()
  })
})

describe('secret storage', () => {
  it('refuses to store secrets when OS encryption is unavailable', async () => {
    setRuntime({ ...rt(), cipher: { ...rt().cipher, available: () => false } })
    const r = await dispatch('ds.save', { kind: 'bing', secret: 'bing-key-123456' })
    expect(r).toMatchObject({ ok: false })
    if (!r.ok) expect(r.error).toMatch(/secure key storage/)
    expect(getSecret('datasource:bing')).toBeNull()
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestEnv, httpGet, type TestEnv } from './helpers'
import { dispatch } from '../../src/main/ipc'
import { getConnection } from '../../src/main/providers/registry'
import { hostIdFrom } from '../../src/main/providers/openai-chatgpt-plan'

let env: TestEnv

beforeEach(() => {
  env = setupTestEnv()
})
afterEach(() => env.cleanup())

/** Starts sign-in, captures the authorize URL, then cancels it in the "browser". */
async function attempt(): Promise<URL> {
  let seen: URL | null = null
  env.onOpenExternal = async (url) => {
    seen = new URL(url)
    const redirect = new URL(seen.searchParams.get('redirect_uri')!)
    redirect.searchParams.set('state', seen.searchParams.get('state')!)
    redirect.searchParams.set('error', 'access_denied')
    setTimeout(() => void httpGet(redirect.toString()), 10)
  }
  const r = await dispatch('providers.signInChatGPT', undefined)
  expect(r.ok).toBe(false)
  return seen!
}

describe('Sign in with ChatGPT', () => {
  it('sends a urn:uuid host ID that is saved before sign-in and reused', async () => {
    const first = await attempt()
    expect(first.origin + first.pathname).toBe('https://auth.openai.com/api/accounts/authorize')
    const host = first.searchParams.get('ext_agent_host_id')!
    expect(host).toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(first.searchParams.get('client_id')).toBe('dynamic_agent_client')
    expect(first.searchParams.get('agent_name_hint')).toBeTruthy()
    expect(first.searchParams.get('resource')).toBe('https://api.openai.com/v1')
    expect(first.searchParams.get('code_challenge_method')).toBe('S256')
    const redirect = new URL(first.searchParams.get('redirect_uri')!)
    expect(redirect.hostname).toBe('127.0.0.1')
    expect(redirect.pathname).toBe('/auth/callback')

    // persisted even though the sign-in was cancelled
    expect(getConnection('chatgpt-plan')?.extra?.extAgentHostId).toBe(host)
    const second = await attempt()
    expect(second.searchParams.get('ext_agent_host_id')).toBe(host)
  })

  it('upgrades a bare UUID to the urn:uuid form', () => {
    const id = '0f8b7c3e-1a2b-4c3d-8e9f-001122334455'
    expect(hostIdFrom({ extAgentHostId: id })).toBe(`urn:uuid:${id}`)
    expect(hostIdFrom({ extAgentHostId: `urn:uuid:${id}` })).toBe(`urn:uuid:${id}`)
    expect(hostIdFrom({})).toMatch(/^urn:uuid:/)
  })
})

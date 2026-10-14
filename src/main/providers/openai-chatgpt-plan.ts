import { createPublicKey, verify as cryptoVerify, randomUUID } from 'node:crypto'
import { responsesChat, type ResponsesClientOpts } from './openai-responses'
import { providerError } from './base'
import { mergeCaps, shouldHide } from './capabilities'
import { fetchWithRetry, fetchJson, HttpError } from '../http'
import { UserError } from '../errors'
import { startLoopback, pkce, randomToken, decodeJwt } from '../oauth'
import { getSecretJson, setSecretJson, deleteSecret } from '../secrets'
import { rt } from '../runtime'
import { log } from '../logger'
import { APP_NAME } from '@shared/constants'
import type { AIProvider, ChatRequest, ModelInfo, ProviderConfig } from './types'

/**
 * "Sign in with ChatGPT" for open-source apps (developers.openai.com/siwc).
 * Plan usage supports the Responses API only and drops sampling parameters.
 */
export const SIWC = {
  issuer: 'https://auth.openai.com',
  authorize: 'https://auth.openai.com/api/accounts/authorize',
  token: 'https://auth.openai.com/api/accounts/oauth/token',
  resource: 'https://api.openai.com/v1',
  scopes: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
  planScope: 'chatgpt.tokens.use.direct',
  callbackPath: '/auth/callback',
  preferredPort: 1455
}

export const MSG_NOT_ELIGIBLE =
  "Your ChatGPT plan isn't eligible for use in other apps. You can use an OpenAI API key instead."
export const MSG_LIMIT =
  "Your ChatGPT plan's limit for this app is used up. Wait for it to reset, or switch this task to another model in Settings."

export const TOKENS_REF = 'chatgpt-plan:tokens'

export interface PlanCredentials {
  email?: string
  issuer: string
  subject: string
  client_id: string
  ext_agent_host_id: string
  id_token: string
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  scopes: string[]
  saved_at: number
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
}

export function mapPlanError(code: string, message: string): Error | null {
  switch (code) {
    case 'subscription_sharing_usage_limit_exceeded':
      return new UserError(MSG_LIMIT, 'plan_limit')
    case 'subscription_sharing_user_not_eligible':
      return new UserError(MSG_NOT_ELIGIBLE, 'not_eligible')
    case 'subscription_sharing_usage_unavailable':
    case 'subscription_sharing_user_unavailable':
      return new UserError(
        'ChatGPT plan usage is temporarily unavailable. Wait a few minutes and try again.',
        'unavailable'
      )
    case 'subscription_sharing_unsupported_capability':
      return new UserError(
        `Your ChatGPT plan doesn't support part of this request (${message}). Try again, or use another model for this task.`,
        'bad_request'
      )
    case 'subscription_sharing_invalid_user':
      return new UserError(
        'ChatGPT says this sign-in is no longer valid. Sign in with ChatGPT again in Settings > AI Models.',
        'auth'
      )
    default:
      return null
  }
}

async function verifyIdToken(
  idToken: string,
  clientId: string,
  nonce: string | null
): Promise<Record<string, unknown>> {
  const [h, p, s] = idToken.split('.')
  const { header, payload } = decodeJwt(idToken)
  const conf = await fetchJson<{ jwks_uri: string }>(`${SIWC.issuer}/.well-known/openid-configuration`, {
    retries: 2,
    timeoutMs: 20_000
  })
  const jwks = await fetchJson<{ keys: (Record<string, unknown> & { kid?: string })[] }>(conf.jwks_uri, {
    retries: 2,
    timeoutMs: 20_000
  })
  const jwk = jwks.keys.find((k) => k.kid === header.kid) ?? jwks.keys[0]
  if (!jwk) throw new UserError("Couldn't verify the ChatGPT sign-in (no signing key). Try signing in again.")
  const key = createPublicKey({ key: jwk as never, format: 'jwk' })
  const alg = String(header.alg)
  const data = Buffer.from(`${h}.${p}`)
  const sig = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const ok = alg.startsWith('ES')
    ? cryptoVerify(`sha${alg.slice(2)}`, data, { key, dsaEncoding: 'ieee-p1363' }, sig)
    : cryptoVerify(`RSA-SHA${alg.slice(2)}`, data, key, sig)
  if (!ok) throw new UserError("Couldn't verify the ChatGPT sign-in. Try signing in again.")
  const aud = payload.aud
  if (payload.iss !== SIWC.issuer)
    throw new UserError('The ChatGPT sign-in came from an unexpected issuer. Try again.')
  if (!(aud === clientId || (Array.isArray(aud) && aud.includes(clientId))))
    throw new UserError('The ChatGPT sign-in was for a different app. Try again.')
  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now() - 60_000)
    throw new UserError('The ChatGPT sign-in expired. Try again.')
  if (nonce && payload.nonce !== nonce)
    throw new UserError('The ChatGPT sign-in failed a security check. Try again.')
  return payload
}

/**
 * The installation's host ID. OpenAI expects a random UUID in the form `urn:uuid:…`, chosen once
 * per installation and reused for every sign-in (a bare UUID is rejected as invalid).
 */
export function hostIdFrom(extra: Record<string, unknown>): string {
  const saved = typeof extra.extAgentHostId === 'string' ? extra.extAgentHostId.trim() : ''
  if (/^urn:uuid:[0-9a-f-]{36}$/i.test(saved)) return saved
  if (/^[0-9a-f-]{36}$/i.test(saved)) return `urn:uuid:${saved}`
  return `urn:uuid:${randomUUID()}`
}

export interface PlanSignInResult {
  creds: PlanCredentials
  eligible: boolean
}

/** Full sign-in flow: loopback listener first, then the system browser. */
export async function signInWithChatGPT(
  extra: Record<string, unknown>,
  signal?: AbortSignal
): Promise<PlanSignInResult> {
  const savedClientId = typeof extra.clientId === 'string' ? extra.clientId : ''
  const hostId = hostIdFrom(extra)
  const prev = getSecretJson<PlanCredentials>(TOKENS_REF)
  const lb = await startLoopback(SIWC.callbackPath, SIWC.preferredPort)
  try {
    const { verifier, challenge } = pkce()
    const state = randomToken()
    const nonce = randomToken()
    const q = new URLSearchParams({
      client_id: savedClientId || 'dynamic_agent_client',
      ext_agent_host_id: hostId,
      response_type: 'code',
      redirect_uri: lb.redirectUri,
      scope: SIWC.scopes,
      resource: SIWC.resource,
      state,
      nonce,
      code_challenge_method: 'S256',
      code_challenge: challenge
    })
    if (!savedClientId) q.set('agent_name_hint', APP_NAME)
    else {
      if (prev?.id_token) q.set('id_token_hint', prev.id_token)
      if (prev?.email) q.set('login_hint', prev.email)
    }
    await rt().openExternal(`${SIWC.authorize}?${q}`)
    const cb = await lb.wait(signal)
    if (cb.get('state') !== state)
      throw new UserError(
        'The sign-in response failed a security check. Click "Sign in with ChatGPT" to try again.'
      )
    if (cb.get('error')) {
      if (cb.get('error') === 'access_denied')
        throw new UserError(
          'Sign-in was cancelled in the browser. Click "Sign in with ChatGPT" to try again.'
        )
      throw new UserError(
        `ChatGPT sign-in failed (${cb.get('error')}). Try again, or use an OpenAI API key instead.`
      )
    }
    const returned = cb.get('client_id')
    if (savedClientId && returned && returned !== savedClientId)
      throw new UserError(
        'ChatGPT returned a different app registration than expected. Try signing in again.'
      )
    const clientId = savedClientId || returned
    if (!clientId) throw new UserError("ChatGPT didn't return an app registration. Try signing in again.")
    const code = cb.get('code')
    if (!code) throw new UserError("ChatGPT didn't return a sign-in code. Try again.")

    let tok: TokenResponse
    try {
      const res = await fetchWithRetry(SIWC.token, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          code_verifier: verifier,
          redirect_uri: lb.redirectUri,
          resource: SIWC.resource
        }),
        retries: 2,
        timeoutMs: 30_000
      })
      tok = (await res.json()) as TokenResponse
    } catch (e) {
      if (e instanceof HttpError && /invalid_grant/.test(e.body))
        throw new UserError('The sign-in code expired. Click "Sign in with ChatGPT" again.')
      throw e
    }
    if (!tok.id_token || !tok.refresh_token) throw new UserError('ChatGPT sign-in was incomplete. Try again.')
    const claims = await verifyIdToken(tok.id_token, clientId, nonce)
    if (prev && prev.subject && prev.client_id === clientId && prev.subject !== claims.sub)
      log.info('ChatGPT sign-in switched to a different account')
    const scopes = (tok.scope ?? String(claims.scope ?? '')).split(/\s+/).filter(Boolean)
    const creds: PlanCredentials = {
      email: typeof claims.email === 'string' ? claims.email : undefined,
      issuer: SIWC.issuer,
      subject: String(claims.sub),
      client_id: clientId,
      ext_agent_host_id: hostId,
      id_token: tok.id_token,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      token_type: tok.token_type ?? 'Bearer',
      expires_in: tok.expires_in ?? 3600,
      scopes,
      saved_at: Date.now()
    }
    setSecretJson(TOKENS_REF, creds)
    return { creds, eligible: scopes.includes(SIWC.planScope) }
  } finally {
    lb.close()
  }
}

export class ChatGPTPlanProvider implements AIProvider {
  id: string
  displayName = 'ChatGPT plan'
  authKind = 'oauth' as const
  private o: ResponsesClientOpts
  constructor(cfg: ProviderConfig) {
    this.id = cfg.connectionId
    this.o = {
      name: 'ChatGPT',
      baseUrl: SIWC.resource,
      auth: async () => ({ header: 'authorization', value: `Bearer ${await this.accessToken()}` }),
      supportsTemperature: false,
      supportsWebSearch: true,
      store: false,
      mapStreamError: mapPlanError
    }
  }

  private creds(): PlanCredentials {
    const c = getSecretJson<PlanCredentials>(TOKENS_REF)
    if (!c)
      throw new UserError(
        'You are not signed in with ChatGPT. Go to Settings > AI Models and click "Sign in with ChatGPT".',
        'auth'
      )
    return c
  }

  private async accessToken(): Promise<string> {
    const c = this.creds()
    if (!c.scopes.includes(SIWC.planScope)) throw new UserError(MSG_NOT_ELIGIBLE, 'not_eligible')
    if (c.saved_at + (c.expires_in - 120) * 1000 > Date.now()) return c.access_token
    return (await this.refresh(c)).access_token
  }

  private async refresh(c: PlanCredentials): Promise<PlanCredentials> {
    try {
      const res = await fetchWithRetry(SIWC.token, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: c.client_id,
          refresh_token: c.refresh_token,
          resource: SIWC.resource
        }),
        retries: 3,
        timeoutMs: 30_000
      })
      const t = (await res.json()) as TokenResponse
      // Refresh rotates the refresh token: replace everything together.
      const next: PlanCredentials = {
        ...c,
        access_token: t.access_token,
        refresh_token: t.refresh_token ?? c.refresh_token,
        id_token: t.id_token ?? c.id_token,
        expires_in: t.expires_in ?? 3600,
        scopes: t.scope ? t.scope.split(/\s+/) : c.scopes,
        saved_at: Date.now()
      }
      setSecretJson(TOKENS_REF, next)
      return next
    } catch (e) {
      if (
        e instanceof HttpError &&
        /invalid_grant|token_expired|refresh_token_(expired|invalidated|reused)|invalid_refresh_token/.test(
          e.body
        )
      ) {
        // Keep the issued client id (in the connection row) but clear the tokens.
        deleteSecret(TOKENS_REF)
        throw new UserError(
          'Your ChatGPT sign-in has expired. Go to Settings > AI Models and click "Sign in with ChatGPT" again.',
          'auth'
        )
      }
      throw e
    }
  }

  private wrap(e: unknown): Error {
    if (e instanceof HttpError) {
      const mapped = mapPlanError(e.apiCode(), e.apiMessage())
      if (mapped) return mapped
    }
    return providerError('ChatGPT', e)
  }

  async testConnection() {
    try {
      const c = this.creds()
      if (!c.scopes.includes(SIWC.planScope)) return { ok: false, message: MSG_NOT_ELIGIBLE }
      const models = await this.listModels()
      if (!models.length)
        return { ok: false, message: 'Signed in, but no models are available to your plan.' }
      const r = await this.chat({
        model: models[0].id,
        messages: [{ role: 'user', content: 'Reply with the word OK.' }]
      })
      return {
        ok: true,
        message: `Connected${c.email ? ` as ${c.email}` : ''}. Test reply: "${r.text.trim().slice(0, 40)}"`
      }
    } catch (e) {
      return { ok: false, message: this.wrap(e).message }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetchWithRetry(`${SIWC.resource}/models`, {
        headers: { authorization: `Bearer ${await this.accessToken()}` },
        retries: 2,
        timeoutMs: 30_000
      })
      const j = (await res.json()) as {
        models?: { slug: string; display_name?: string; visibility?: string }[]
        data?: { id: string }[]
      }
      if (j.models)
        return j.models
          .filter((m) => !m.visibility || m.visibility === 'list')
          .map((m) => ({
            id: m.slug,
            label: m.display_name ?? m.slug,
            capabilities: mergeCaps(['text', 'json', 'vision', 'webSearch'], m.slug).filter(
              (c) => c !== 'imageGen'
            ),
            inputPricePerMTok: 0,
            outputPricePerMTok: 0
          }))
      return (j.data ?? []).map((m) => ({
        id: m.id,
        label: m.id,
        capabilities: mergeCaps(undefined, m.id).filter((c) => c !== 'imageGen'),
        hidden: shouldHide(m.id),
        inputPricePerMTok: 0,
        outputPricePerMTok: 0
      }))
    } catch (e) {
      throw this.wrap(e)
    }
  }

  async chat(req: ChatRequest, onToken?: (t: string) => void) {
    try {
      // Plan usage drops sampling parameters like temperature.
      const r = await responsesChat(this.o, { ...req, temperature: undefined }, onToken)
      return { ...r, costUsd: 0 }
    } catch (e) {
      throw this.wrap(e)
    }
  }
  // Image generation through the plan is not listed as supported in OpenAI's docs at
  // build time, so this provider has no generateImage (see DECISIONS.md).
}

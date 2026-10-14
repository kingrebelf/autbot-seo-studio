import { HttpError } from '../http'
import { UserError, CancelledError, isAbort } from '../errors'
import type { ChatRequest, ContentPart } from './types'

/** Strip code fences and pull the first JSON value out of a model's reply. */
export function parseJsonLoose(text: string): unknown {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  try {
    return JSON.parse(t)
  } catch {
    /* try harder */
  }
  const start = t.search(/[[{]/)
  if (start < 0) return undefined
  const open = t[start]
  const close = open === '{' ? '}' : ']'
  const end = t.lastIndexOf(close)
  if (end <= start) return undefined
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch {
    return undefined
  }
}

/** Instruction appended to the system prompt when a provider has no native JSON mode. */
export function jsonInstruction(schema: object): string {
  return `\n\nReturn ONLY valid JSON (no markdown, no commentary) matching this JSON schema:\n${JSON.stringify(schema)}`
}

export function textOf(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content
  return content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
}

export function systemWithJson(req: ChatRequest, native: boolean): string | undefined {
  if (!req.jsonSchema || native) return req.system
  return (req.system ?? '') + jsonInstruction(req.jsonSchema)
}

/**
 * Some JSON schema keywords are rejected by strict structured-output modes. This makes a
 * copy that every provider accepts: every property required, no additionalProperties.
 */
export function strictSchema(schema: object): object {
  const walk = (s: unknown): unknown => {
    if (Array.isArray(s)) return s.map(walk)
    if (!s || typeof s !== 'object') return s
    const o: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
      if (k === '$schema' || k === 'title' || k === 'default' || k === 'format' || k === 'pattern') continue
      if (
        k === 'minItems' ||
        k === 'maxItems' ||
        k === 'minimum' ||
        k === 'maximum' ||
        k === 'minLength' ||
        k === 'maxLength'
      )
        continue
      o[k] = walk(v)
    }
    if (o.type === 'object' && o.properties) {
      o.additionalProperties = false
      o.required = Object.keys(o.properties as object)
    }
    return o
  }
  return walk(schema) as object
}

/** Turn an HTTP error from a provider into plain English with a next step. */
export function providerError(name: string, err: unknown): Error {
  if (err instanceof UserError || err instanceof CancelledError) return err
  if (isAbort(err)) return new CancelledError()
  if (err instanceof HttpError) {
    const m = err.apiMessage()
    const code = err.apiCode()
    if (err.status === 401)
      return new UserError(
        `${name} didn't accept your key or sign-in. Check that you copied the whole key (no spaces), or create a new one, then click Test again.`,
        'auth'
      )
    if (err.status === 403)
      return new UserError(
        `${name} refused the request (${m || 'permission denied'}). Your key may not have access to this model or feature; check your account on the provider's website, or pick another model in Settings > AI Models.`,
        'forbidden'
      )
    if (err.status === 404)
      return new UserError(
        `${name} couldn't find that model or address (${m || 'not found'}). Click "Refresh models" in Settings > AI Models and pick a model from the list.`,
        'not_found'
      )
    if (err.status === 429) {
      if (/quota|billing|credit|insufficient/i.test(m + code))
        return new UserError(
          `${name} says your account is out of credit or over its quota. Add credit or raise your limit on the provider's website, or switch this task to another model in Settings > AI Models.`,
          'quota'
        )
      return new UserError(
        `${name} is getting too many requests right now. Wait a minute and try again, or switch this task to another model.`,
        'rate_limit'
      )
    }
    if (err.status === 400)
      return new UserError(
        `${name} couldn't handle this request (${m || 'bad request'}). Try a different model for this task in Settings > AI Models.`,
        'bad_request'
      )
    if (err.status >= 500)
      return new UserError(
        `${name} is having problems right now (error ${err.status}). Wait a few minutes and try again.`,
        'server'
      )
  }
  if (err instanceof Error && /ECONNREFUSED|fetch failed/i.test(err.message + String(err.cause ?? '')))
    return new UserError(
      `Couldn't connect to ${name}. Check your internet connection (or that the local app is running) and try again.`,
      'network'
    )
  return err instanceof Error ? err : new Error(String(err))
}

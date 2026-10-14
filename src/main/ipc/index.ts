import { appRoutes } from './app'
import { sitesRoutes } from './sites'
import { providerRoutes } from './providers'
import { contentRoutes } from './content'
import { featureRoutes } from './features'
import { friendlyMessage, UserError } from '../errors'
import { log } from '../logger'
import type { Route } from './route'
import type { z } from 'zod'

export const routes = { ...appRoutes, ...sitesRoutes, ...providerRoutes, ...contentRoutes, ...featureRoutes }

export type Routes = typeof routes
export type RouteName = keyof Routes
export type RouteInput<K extends RouteName> = Routes[K] extends Route<infer I, unknown> ? z.input<I> : never
export type RouteOutput<K extends RouteName> =
  Routes[K] extends Route<z.ZodType, infer O> ? Awaited<O> : never

export type ApiResult = { ok: true; data: unknown } | { ok: false; error: string; code?: string }

/** Validate input with zod, run the handler, and turn errors into plain English. */
export async function dispatch(name: string, input: unknown): Promise<ApiResult> {
  const r = (routes as Record<string, Route<z.ZodType, unknown>>)[name]
  if (!r)
    return {
      ok: false,
      error: "The app tried to do something it doesn't know how to do. Please restart the app."
    }
  const parsed = r.input.safeParse(input)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    log.warn(`Invalid input for ${name}`, parsed.error.issues)
    const msg =
      first?.message && !/^Invalid|^Expected/.test(first.message)
        ? first.message
        : `Please check the "${String(first?.path?.join('.') || 'form')}" field and try again.`
    return { ok: false, error: msg, code: 'invalid_input' }
  }
  try {
    return { ok: true, data: await r.handler(parsed.data) }
  } catch (e) {
    if (!(e instanceof UserError)) log.error(`IPC ${name} failed`, e)
    else log.info(`IPC ${name}: ${e.message}`)
    return { ok: false, error: friendlyMessage(e), code: e instanceof UserError ? e.code : 'error' }
  }
}

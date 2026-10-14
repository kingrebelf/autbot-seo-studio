import type { RouteName, RouteInput, RouteOutput } from '../api-types'

/** An error the main process already turned into plain English. */
export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message)
  }
}

/** Call a main-process route. Inputs are validated with zod on the other side. */
export async function api<K extends RouteName>(
  name: K,
  ...args: RouteInput<K> extends undefined ? [input?: RouteInput<K>] : [input: RouteInput<K>]
): Promise<RouteOutput<K>> {
  const r = await window.api.invoke(name, args[0])
  if (!r.ok) throw new ApiError(r.error ?? 'Something went wrong. Please try again.', r.code)
  return r.data as RouteOutput<K>
}

export type { RouteName, RouteInput, RouteOutput }

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type RouteName, type RouteInput, type RouteOutput } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

/**
 * Load data from a route and keep it fresh. `input` is compared by JSON, so passing a new
 * object with the same contents does not refetch. Pass `null` as input to skip loading.
 */
export function useApi<K extends RouteName>(
  name: K,
  input: RouteInput<K> | null,
  opts: { refreshOnJobs?: boolean } = {}
) {
  const [data, setData] = useState<RouteOutput<K> | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(input !== null)
  const key = JSON.stringify(input)
  const seq = useRef(0)

  const reload = useCallback(async () => {
    if (key === 'null') return
    const n = ++seq.current
    setLoading(true)
    try {
      const r = await (api as (n: string, i: unknown) => Promise<RouteOutput<K>>)(
        name,
        key === undefined ? undefined : JSON.parse(key ?? 'null')
      )
      if (n === seq.current) {
        setData(r)
        setError(null)
      }
    } catch (e) {
      if (n === seq.current) setError(errorMessage(e))
    } finally {
      if (n === seq.current) setLoading(false)
    }
  }, [name, key])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!opts.refreshOnJobs) return
    let t: ReturnType<typeof setTimeout> | null = null
    const off = window.api.on('jobs:update', () => {
      if (t) clearTimeout(t)
      t = setTimeout(() => void reload(), 400)
    })
    return () => {
      off()
      if (t) clearTimeout(t)
    }
  }, [opts.refreshOnJobs, reload])

  return { data, error, loading, reload, setData }
}

/** Run an action with a busy flag and a toast on failure. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null)
  const run = useCallback(
    async <T>(
      label: string,
      fn: () => Promise<T>,
      onError?: (msg: string) => void
    ): Promise<T | undefined> => {
      setBusy(label)
      try {
        return await fn()
      } catch (e) {
        const msg = errorMessage(e)
        if (onError) onError(msg)
        else window.dispatchEvent(new CustomEvent('app-toast', { detail: { kind: 'error', title: msg } }))
        return undefined
      } finally {
        setBusy(null)
      }
    },
    []
  )
  return { busy, run }
}

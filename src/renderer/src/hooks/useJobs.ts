import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { RouteOutput } from '@/lib/api'

export type JobView = RouteOutput<'jobs.list'>[number]

/** Live list of jobs (refreshes on every job update from the main process). */
export function useJobs(siteId: number | null) {
  const [jobs, setJobs] = useState<JobView[]>([])
  useEffect(() => {
    let alive = true
    const load = () =>
      api('jobs.list', { siteId: null })
        .then((j) => alive && setJobs(siteId ? j.filter((x) => x.siteId === siteId || x.siteId === null) : j))
        .catch(() => undefined)
    void load()
    let t: ReturnType<typeof setTimeout> | null = null
    const off = window.api.on('jobs:update', () => {
      if (t) clearTimeout(t)
      t = setTimeout(load, 250)
    })
    return () => {
      alive = false
      off()
      if (t) clearTimeout(t)
    }
  }, [siteId])
  return jobs
}

/** Streaming tokens for one content piece while it's being written. */
export function useTokenStream(contentId: number | null, onChunk: (chunk: string) => void) {
  useEffect(() => {
    if (!contentId) return
    return window.api.on('jobs:token', (p) => {
      const { contentId: cid, chunk } = p as { contentId: number | null; chunk: string }
      if (cid === contentId) onChunk(chunk)
    })
  }, [contentId, onChunk])
}

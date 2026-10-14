import { useNavigate } from 'react-router-dom'
import { Ban, RotateCcw, Play, ExternalLink } from 'lucide-react'
import { api } from '@/lib/api'
import type { JobView } from '@/hooks/useJobs'
import { useAction } from '@/hooks/useApi'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/misc'
import { timeAgo } from '@/lib/utils'
import { Drawer } from './Drawer'

const STATUS: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' }
> = {
  queued: { label: 'Waiting to start', variant: 'secondary' },
  running: { label: 'Working', variant: 'default' },
  waiting_for_user: { label: 'Needs you', variant: 'warning' },
  done: { label: 'Done', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'outline' }
}

export function ActivityDrawer({
  open,
  onOpenChange,
  jobs
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  jobs: JobView[]
}) {
  const nav = useNavigate()
  const { busy, run } = useAction()
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Activity"
      side="bottom"
      actions={
        <Button size="sm" variant="ghost" onClick={() => run('clear', () => api('jobs.clearFinished'))}>
          Clear finished
        </Button>
      }
    >
      {jobs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing running. Background work (research, writing, crawling, checks) shows up here.
        </p>
      )}
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {jobs.map((j) => {
          const st = STATUS[j.status] ?? STATUS.queued
          const budget = j.status === 'waiting_for_user' && j.step === 'budget'
          return (
            <li key={j.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center gap-2">
                {j.status === 'running' && <Spinner className="text-primary" />}
                <span className="font-medium">{j.label}</span>
                <Badge variant={st.variant} className="ml-auto">
                  {st.label}
                </Badge>
              </div>
              {j.progress && j.status !== 'done' && (
                <div className="mt-1 text-muted-foreground">{j.progress}</div>
              )}
              {j.error && <div className="mt-1 text-destructive">{j.error}</div>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{timeAgo(j.updatedAt)}</span>
                <div className="ml-auto flex gap-1">
                  {j.contentId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onOpenChange(false)
                        nav(
                          j.status === 'waiting_for_user' && !budget
                            ? `/new/${j.contentId}`
                            : `/content/${j.contentId}`
                        )
                      }}
                    >
                      <ExternalLink /> Open
                    </Button>
                  )}
                  {(j.status === 'queued' || j.status === 'running' || j.status === 'waiting_for_user') && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busy === `c${j.id}`}
                      onClick={() => run(`c${j.id}`, () => api('jobs.cancel', { id: j.id }))}
                    >
                      <Ban /> Cancel
                    </Button>
                  )}
                  {(j.status === 'failed' || j.status === 'cancelled') && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busy === `r${j.id}`}
                      onClick={() => run(`r${j.id}`, () => api('jobs.retry', { id: j.id }))}
                    >
                      <RotateCcw /> Retry
                    </Button>
                  )}
                  {budget && (
                    <Button
                      size="sm"
                      loading={busy === `g${j.id}`}
                      onClick={() =>
                        run(`g${j.id}`, () => api('jobs.continue', { id: j.id, budgetOverride: true }))
                      }
                    >
                      <Play /> Continue anyway
                    </Button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </Drawer>
  )
}

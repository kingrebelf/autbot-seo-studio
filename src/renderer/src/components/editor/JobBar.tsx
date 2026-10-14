import { X } from 'lucide-react'
import { api } from '@/lib/api'
import { useAction } from '@/hooks/useApi'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/misc'
import type { ContentView } from './types'

const JOB_NAMES: Record<string, string> = {
  research: 'Researching',
  brief: 'Writing the brief',
  write: 'Writing',
  check: 'Running checks',
  images: 'Making images',
  'link-backs': 'Adding links to older pages',
  'mode-d': 'Refreshing the page'
}

/** One line at the top while a background job works on this piece. */
export function JobBar({
  job,
  onChange
}: {
  job: NonNullable<ContentView['activeJob']>
  onChange: () => void
}) {
  const { busy, run } = useAction()
  const waiting = job.status === 'waiting_for_user'
  const text = job.progress || job.step || (job.status === 'queued' ? 'Waiting to start…' : 'Working…')
  return (
    <div
      className="flex items-center gap-3 border-b bg-primary/5 px-4 py-2 text-sm"
      role="status"
      aria-live="polite"
    >
      {waiting ? <span className="h-2 w-2 rounded-full bg-warning" /> : <Spinner className="text-primary" />}
      <span className="font-medium">{JOB_NAMES[job.type] ?? 'Working'}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {waiting ? 'Waiting for you. Open Activity (bottom left) to continue.' : text}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7"
        loading={busy === 'cancel'}
        onClick={() =>
          void run('cancel', async () => {
            await api('jobs.cancel', { id: job.id })
            onChange()
          })
        }
      >
        <X /> Cancel
      </Button>
    </div>
  )
}

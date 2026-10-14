import { useNavigate } from 'react-router-dom'
import { Play, Wrench } from 'lucide-react'
import type { RouteOutput } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Callout, Spinner } from '@/components/ui/misc'

type Job = RouteOutput<'modes.latest'>

interface Suggestion {
  kind: 'refresh' | 'supporting' | 'title_meta' | 'thin'
  page_url: string | null
  title: string
  keyword: string
  why: string
  proposed_title: string | null
  proposed_meta: string | null
}

const KINDS: Record<
  Suggestion['kind'],
  { label: string; variant: 'default' | 'secondary' | 'warning' | 'outline' }
> = {
  refresh: { label: 'Refresh a page', variant: 'default' },
  supporting: { label: 'New supporting post', variant: 'secondary' },
  title_meta: { label: 'Fix title and description', variant: 'warning' },
  thin: { label: 'Thin page', variant: 'outline' }
}

function isSuggestion(x: unknown): x is Suggestion {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.kind === 'string' && o.kind in KINDS && typeof o.title === 'string'
}

/** Pull Mode C's suggestions out of the loosely typed job output. */
function readOutput(job: Job): { suggestions: Suggestion[]; message: string | null } {
  const out = (job?.output ?? {}) as Record<string, unknown>
  const list = Array.isArray(out.suggestions) ? out.suggestions.filter(isSuggestion) : []
  return { suggestions: list, message: typeof out.message === 'string' ? out.message : null }
}

export function startLinkFor(s: Suggestion): string {
  if ((s.kind === 'refresh' || s.kind === 'title_meta') && s.page_url) {
    const notes =
      s.kind === 'title_meta'
        ? [
            s.why,
            s.proposed_title && `Proposed title: ${s.proposed_title}`,
            s.proposed_meta && `Proposed meta description: ${s.proposed_meta}`
          ]
        : [s.why]
    return `/new?${new URLSearchParams({ mode: 'D', url: s.page_url, notes: notes.filter(Boolean).join('\n') }).toString()}`
  }
  return `/new?${new URLSearchParams({ mode: 'A', topic: s.title, notes: [s.keyword && `Keyword: ${s.keyword}`, s.why].filter(Boolean).join('\n') }).toString()}`
}

interface Props {
  job: Job | undefined
  running: boolean
  progress: string | null
}

export function MaintenancePanel({ job, running, progress }: Props) {
  const nav = useNavigate()
  if (running)
    return (
      <Callout title="Maintenance review running…">
        <span className="inline-flex items-center gap-2">
          <Spinner /> {progress ?? 'Waiting to start'}. You can leave this screen; the results will be here
          when you come back.
        </span>
      </Callout>
    )
  if (!job) return null
  if (job.status === 'failed')
    return (
      <Callout kind="error" title="The maintenance review stopped">
        {job.error ?? 'Something went wrong. Please try again.'}
      </Callout>
    )
  if (job.status !== 'done') return null
  const { suggestions, message } = readOutput(job)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-4 w-4" /> Maintenance review
        </CardTitle>
        <CardDescription>
          Protect and grow what already ranks. Last run {formatDateTime(job.updatedAt)}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!suggestions.length ? (
          <p className="text-sm text-muted-foreground">
            {message ?? 'Nothing needs attention right now. Check back in a few weeks.'}
          </p>
        ) : (
          <ul className="divide-y">
            {suggestions.map((s, i) => (
              <li key={i} className="flex flex-wrap items-start gap-4 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={KINDS[s.kind].variant}>{KINDS[s.kind].label}</Badge>
                    <span className="font-medium">{s.title}</span>
                  </div>
                  {s.page_url && <div className="truncate text-xs text-muted-foreground">{s.page_url}</div>}
                  {s.keyword && <div className="text-xs text-muted-foreground">Keyword: {s.keyword}</div>}
                  <p className="text-sm">{s.why}</p>
                  {(s.proposed_title || s.proposed_meta) && (
                    <div className="mt-1 rounded-md bg-muted/50 p-2 text-xs">
                      {s.proposed_title && (
                        <div>
                          <span className="font-medium">New title:</span> {s.proposed_title}
                        </div>
                      )}
                      {s.proposed_meta && (
                        <div className="mt-0.5">
                          <span className="font-medium">New description:</span> {s.proposed_meta}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <Button size="sm" onClick={() => nav(startLinkFor(s))}>
                  <Play /> Start
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

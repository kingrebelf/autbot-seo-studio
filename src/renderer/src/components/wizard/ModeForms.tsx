import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { useApi, useAction } from '@/hooks/useApi'
import type { Mode } from '@shared/types'
import { CONTENT_TYPES, LENGTHS, type LengthKey } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea, Checkbox } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Callout, Spinner, ErrorText } from '@/components/ui/misc'
import { suggestionLink } from '@/routes/Home'
import { contentHref, STATUS_VARIANT } from '@/routes/ContentList'
import { ModelOverrides, type Overrides } from './ModelOverrides'
import { cn, timeAgo } from '@/lib/utils'

export interface Prefill {
  topic?: string
  notes?: string
  type?: string
  url?: string
  calendarItemId?: number
}

const NOTES_LABEL = 'Anything else I should know?'
const NOTES_HINT = 'For example: "we have a great deal on product X this month" or "we no longer offer Y".'

export function LengthPicker({ value, onChange }: { value: LengthKey; onChange: (v: LengthKey) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(LENGTHS) as LengthKey[]).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={cn(
            'rounded-md border px-3 py-1.5 text-sm',
            value === k ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
          )}
        >
          {LENGTHS[k].label}
        </button>
      ))}
    </div>
  )
}

const CHOOSABLE_TYPES = CONTENT_TYPES.filter((t) => t !== 'refresh' && t !== 'page')

export function ModeForm({ mode, siteId, prefill }: { mode: Mode; siteId: number; prefill: Prefill }) {
  const nav = useNavigate()
  const { busy, run } = useAction()
  const [topic, setTopic] = useState(prefill.topic ?? '')
  const [notes, setNotes] = useState(prefill.notes ?? '')
  const [type, setType] = useState<string>(
    prefill.type && (CHOOSABLE_TYPES as readonly string[]).includes(prefill.type) ? prefill.type : ''
  )
  const [count, setCount] = useState(5)
  const [length, setLength] = useState<LengthKey>('standard')
  const [areas, setAreas] = useState('')
  const [months, setMonths] = useState(6)
  const [replace, setReplace] = useState(false)
  const [url, setUrl] = useState(prefill.url ?? '')
  const [error, setError] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [overrides, setOverrides] = useState<Overrides>({})
  const areaList = areas
    .split(/[\n,]/)
    .map((a) => a.trim())
    .filter(Boolean)
  const { data: localWarning } = useApi(
    'modes.localWarning',
    mode === 'F' ? { count: areaList.length } : null
  )

  useEffect(() => {
    setStarted(false)
    setError(null)
  }, [mode])

  const start = () =>
    run(
      'start',
      async () => {
        setError(null)
        if (mode === 'A') {
          const id = await api('content.create', {
            siteId,
            topic,
            notes: notes || undefined,
            type: (type || undefined) as (typeof CONTENT_TYPES)[number] | undefined,
            calendarItemId: prefill.calendarItemId,
            modelOverrides: Object.keys(overrides).length ? overrides : undefined
          })
          nav(`/new/${id}`)
          return
        }
        const r = await api('modes.start', {
          siteId,
          mode,
          notes: notes || undefined,
          topic: topic || undefined,
          url: url || undefined,
          areas: mode === 'F' ? areaList : undefined,
          count: mode === 'E' ? count : undefined,
          months: mode === 'G' ? months : undefined,
          length: mode === 'E' || mode === 'F' ? length : undefined,
          replace: mode === 'G' ? replace : undefined
        })
        if ('contentId' in r && r.contentId) nav(`/content/${r.contentId}`)
        else setStarted(true)
      },
      setError
    )

  const notesField = (
    <Field label={NOTES_LABEL} hint={NOTES_HINT}>
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
    </Field>
  )

  return (
    <div className="space-y-4">
      {mode === 'A' && (
        <>
          <Field
            label="Topic, product or service"
            hint='For example "spring lawn aeration" or "dental implants cost".'
          >
            <Input
              autoFocus
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && topic.trim().length > 1 && void start()}
            />
          </Field>
          <Field
            label="Content type (optional)"
            hint="Leave it on AI decides and you can pick after the research."
          >
            <Select value={type} onChange={(e) => setType(e.target.value)} className="max-w-xs capitalize">
              <option value="">AI decides after research</option>
              {CHOOSABLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <ModelOverrides value={overrides} onChange={setOverrides} />
        </>
      )}
      {mode === 'D' && <PagePicker siteId={siteId} value={url} onChange={setUrl} />}
      {mode === 'E' && (
        <>
          <Field
            label="Main topic for the set"
            hint="The pillar page covers this topic broadly; supporting posts go deep on parts of it."
          >
            <Input autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} />
          </Field>
          <Field label={`Supporting posts: ${count}`}>
            <input
              type="range"
              min={3}
              max={8}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-64 accent-[hsl(var(--primary))]"
            />
          </Field>
          <Field label="Length of supporting posts">
            <LengthPicker value={length} onChange={setLength} />
          </Field>
        </>
      )}
      {mode === 'F' && (
        <>
          <Field label="Service the pages are for">
            <Input
              autoFocus
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. emergency plumbing"
            />
          </Field>
          <Field
            label="Towns or areas"
            hint="One per line (or separated by commas). Each page will be genuinely different, not copy-paste with the town swapped."
          >
            <Textarea value={areas} onChange={(e) => setAreas(e.target.value)} rows={4} />
          </Field>
          {localWarning && <Callout kind="warning">{localWarning}</Callout>}
          <Field label="Length">
            <LengthPicker value={length} onChange={setLength} />
          </Field>
        </>
      )}
      {mode === 'G' && (
        <>
          <Field label="How far ahead?">
            <div className="flex gap-2">
              {[6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm',
                    months === m ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
                  )}
                >
                  {m} months
                </button>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace planned
            items that haven't been started yet
          </label>
          <p className="text-sm text-muted-foreground">
            Timing rule: content goes up 2 to 3 months before the season people search for it.
          </p>
        </>
      )}
      {(mode === 'B' || mode === 'C') && (
        <p className="text-sm text-muted-foreground">
          {mode === 'B'
            ? 'The app looks at your business profile, your site, Search Console (if connected), competitors and your calendar, then recommends your 5 best next pieces.'
            : 'Uses Search Console data (or your tracked keywords) to find pages ranking 4 to 20, pages losing clicks, low click rates, thin pages and topics that need supporting posts.'}
        </p>
      )}
      {notesField}
      <ErrorText error={error} />
      <Button
        size="lg"
        loading={busy === 'start'}
        disabled={
          (mode === 'A' && topic.trim().length < 2) ||
          (mode === 'D' && !url) ||
          (mode === 'E' && !topic.trim()) ||
          (mode === 'F' && (!topic.trim() || !areaList.length))
        }
        onClick={() => void start()}
      >
        {mode === 'A'
          ? 'Research it'
          : mode === 'D'
            ? 'Refresh this page'
            : mode === 'G'
              ? 'Plan it'
              : mode === 'E' || mode === 'F'
                ? 'Plan and start the batch'
                : 'Go'}{' '}
        <ArrowRight />
      </Button>
      {mode !== 'A' && mode !== 'D' && <ModeResult siteId={siteId} mode={mode} highlight={started} />}
    </div>
  )
}

function PagePicker({
  siteId,
  value,
  onChange
}: {
  siteId: number
  value: string
  onChange: (u: string) => void
}) {
  const { data, loading } = useApi('sites.pages', { siteId })
  const [q, setQ] = useState('')
  const pages = useMemo(
    () =>
      (data ?? [])
        .filter((p) => !q || `${p.url} ${p.title ?? ''}`.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 200),
    [data, q]
  )
  return (
    <Field
      label="Which page?"
      hint="Pages come from the site crawl and WordPress. Re-crawl in Site Health if one is missing."
    >
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Search pages" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mt-2 max-h-72 overflow-y-auto rounded-md border">
        {loading && (
          <div className="p-3 text-sm text-muted-foreground">
            <Spinner className="mr-2 inline" /> Loading pages…
          </div>
        )}
        {!loading && !pages.length && (
          <div className="p-3 text-sm text-muted-foreground">
            No pages found yet. The site crawl may still be running; check Activity.
          </div>
        )}
        {pages.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.url)}
            className={cn(
              'block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent',
              value === p.url && 'bg-primary/10'
            )}
          >
            <div className="truncate font-medium">{p.title || p.url}</div>
            <div className="truncate text-xs text-muted-foreground">
              {p.url} {p.wordCount ? `· ${p.wordCount} words` : ''} {p.wpId ? '· WordPress' : ''}
            </div>
          </button>
        ))}
      </div>
    </Field>
  )
}

interface SuggestionOut {
  title: string
  keyword: string
  content_type?: string
  why: string
  kind?: 'refresh' | 'supporting' | 'title_meta' | 'thin'
  page_url?: string | null
  proposed_title?: string | null
  proposed_meta?: string | null
}

/** Shows the latest run of a planning mode and its results. */
function ModeResult({ siteId, mode, highlight }: { siteId: number; mode: Mode; highlight: boolean }) {
  const nav = useNavigate()
  const type = `mode-${mode.toLowerCase()}`
  const { data: job } = useApi('modes.latest', { siteId, type }, { refreshOnJobs: true })
  const out = (job?.output ?? {}) as { suggestions?: SuggestionOut[]; contentIds?: number[]; items?: number }
  const { data: content } = useApi('content.list', out.contentIds?.length ? { siteId } : null, {
    refreshOnJobs: true
  })
  const { run } = useAction()
  if (!job) return null
  const active = job.status === 'running' || job.status === 'queued'
  return (
    <div className={cn('mt-6 rounded-lg border p-4', highlight && 'border-primary/50')}>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="font-semibold">{active ? 'Working on it' : 'Latest result'}</span>
        <span className="text-muted-foreground">{timeAgo(job.updatedAt)}</span>
      </div>
      {active && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> {job.progress ?? 'Starting…'}
        </div>
      )}
      {job.status === 'failed' && (
        <Callout kind="error" title="That didn't work">
          {job.error}
          <div className="mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => run('retry', () => api('jobs.retry', { id: job.id }))}
            >
              Try again
            </Button>
          </div>
        </Callout>
      )}
      {job.status === 'waiting_for_user' && job.step === 'budget' && (
        <Callout kind="warning" title="Paused: monthly AI budget reached">
          {job.error ?? 'This site reached its monthly AI budget.'}
          <div className="mt-2">
            <Button
              size="sm"
              onClick={() => run('go', () => api('jobs.continue', { id: job.id, budgetOverride: true }))}
            >
              Continue anyway
            </Button>
          </div>
        </Callout>
      )}
      {job.status === 'done' && out.suggestions && (
        <ul className="divide-y">
          {out.suggestions.map((s, i) => (
            <li key={i} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{s.title}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {s.keyword && <Badge variant="secondary">{s.keyword}</Badge>}
                  {s.content_type && <Badge variant="outline">{s.content_type}</Badge>}
                  {s.kind && <Badge variant="outline">{s.kind.replace('_', ' / ')}</Badge>}
                  {s.page_url && <span className="truncate text-xs text-muted-foreground">{s.page_url}</span>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{s.why}</p>
                {(s.proposed_title || s.proposed_meta) && (
                  <div className="mt-2 rounded-md bg-muted/50 p-2 text-xs">
                    {s.proposed_title && (
                      <div>
                        <span className="font-medium">New title:</span> {s.proposed_title}
                      </div>
                    )}
                    {s.proposed_meta && (
                      <div>
                        <span className="font-medium">New meta description:</span> {s.proposed_meta}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => nav(suggestionLink(s))}>
                Start <ArrowRight />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {job.status === 'done' && out.contentIds && (
        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            Each piece is researched in the background. Open one to pick its keyword, then the brief, then
            write.
          </p>
          <ul className="divide-y">
            {(content ?? [])
              .filter((c) => out.contentIds!.includes(c.id))
              .map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="flex-1 font-medium">
                    {c.title || c.topic} {c.isPillar && <Badge variant="outline">Pillar</Badge>}
                  </span>
                  <Badge variant={STATUS_VARIANT[c.status] ?? 'outline'}>{c.status}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => nav(contentHref(c))}>
                    Open
                  </Button>
                </li>
              ))}
          </ul>
        </div>
      )}
      {job.status === 'done' && mode === 'G' && (
        <div className="flex items-center gap-3 text-sm">
          <span>{out.items ?? 0} calendar items planned.</span>
          <Button size="sm" onClick={() => nav('/plan')}>
            Open the calendar <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  )
}

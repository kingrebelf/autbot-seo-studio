import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarPlus,
  Download,
  ExternalLink,
  GripVertical,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAction, useApi } from '@/hooks/useApi'
import { useJobs } from '@/hooks/useJobs'
import { cn, monthLabel } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Callout, EmptyState, ErrorText, Loading, Spinner } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { ItemDialog } from './ItemDialog'
import { PlanDialog } from './PlanDialog'
import { focusOf, monthRange, startLink, statusLabel, ymOf, type CalendarItem } from './calendar-utils'

export function CalendarBoard({ siteId }: { siteId: number }) {
  const nav = useNavigate()
  const [span, setSpan] = useState<6 | 12>(6)
  const { data, error, loading, reload, setData } = useApi('calendar.list', { siteId })
  const jobs = useJobs(siteId)
  const { busy, run } = useAction()
  const [ask, confirmDialog] = useConfirm()
  const [planOpen, setPlanOpen] = useState(false)
  const [editing, setEditing] = useState<{ item: CalendarItem | null; month: string } | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [dismissedJob, setDismissedJob] = useState<number | null>(null)

  const items = useMemo(() => data ?? [], [data])
  const thisMonth = ymOf(new Date())

  /* ---------- months shown: this month + the chosen span, plus any later month that has items */
  const months = useMemo(() => {
    const base = monthRange(thisMonth, span + 1)
    const extra = items.map((i) => i.month).filter((m) => m > base[base.length - 1])
    return [...new Set([...base, ...extra])].sort()
  }, [items, span, thisMonth])
  const earlier = items.filter((i) => i.month < thisMonth && i.status !== 'done' && i.status !== 'skipped')
  const byMonth = useMemo(() => {
    const m = new Map<string, CalendarItem[]>()
    for (const i of items) {
      if (!m.has(i.month)) m.set(i.month, [])
      m.get(i.month)!.push(i)
    }
    for (const list of m.values())
      list.sort((a, b) => (a.itemType === b.itemType ? a.id - b.id : a.itemType === 'main' ? -1 : 1))
    return m
  }, [items])

  /* ---------- Mode G job progress */
  const planJob = useMemo(
    () => jobs.filter((j) => j.type === 'mode-g').sort((a, b) => b.id - a.id)[0] ?? null,
    [jobs]
  )
  const planRunning = planJob !== null && (planJob.status === 'running' || planJob.status === 'queued')
  const prevStatus = useRef<string | null>(null)
  useEffect(() => {
    const st = planJob?.status ?? null
    if (
      prevStatus.current &&
      (prevStatus.current === 'running' || prevStatus.current === 'queued') &&
      st === 'done'
    ) {
      void reload()
      toast({
        kind: 'success',
        title: 'Your content plan is ready',
        body: 'New items were added to the calendar.'
      })
    }
    prevStatus.current = st
  }, [planJob?.status, reload])

  /* ---------- actions */
  const moveTo = async (id: number, month: string) => {
    const item = items.find((i) => i.id === id)
    if (!item || item.month === month) return
    setData(items.map((i) => (i.id === id ? { ...i, month } : i)))
    await run('move', () => api('calendar.update', { id, month }))
    void reload()
  }

  const remove = async (item: CalendarItem) => {
    if (
      !(await ask({
        title: 'Remove this item?',
        body: `"${item.title}" will be taken off the calendar. Any content you already started from it stays.`,
        confirm: 'Remove',
        danger: true
      }))
    )
      return
    await run('delete', () => api('calendar.delete', { id: item.id }))
    void reload()
  }

  const exportCsv = () =>
    run('export', async () => {
      const path = await api('calendar.exportCsv', { siteId })
      if (path) toast({ kind: 'success', title: 'Calendar exported', body: path })
    })

  const onDrop = (e: DragEvent, month: string) => {
    e.preventDefault()
    const id = Number(e.dataTransfer.getData('text/plain'))
    setDropTarget(null)
    setDragId(null)
    if (id) void moveTo(id, month)
  }

  const dropProps = (month: string) => ({
    onDragOver: (e: DragEvent) => {
      if (dragId === null) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (dropTarget !== month) setDropTarget(month)
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null))
        setDropTarget((t) => (t === month ? null : t))
    },
    onDrop: (e: DragEvent) => onDrop(e, month)
  })

  const card = (item: CalendarItem) => (
    <ItemCard
      key={item.id}
      item={item}
      dragging={dragId === item.id}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(item.id))
        e.dataTransfer.effectAllowed = 'move'
        setDragId(item.id)
      }}
      onDragEnd={() => {
        setDragId(null)
        setDropTarget(null)
      }}
      onStart={() => nav(startLink(item))}
      onOpen={() => item.contentId && nav(`/content/${item.contentId}`)}
      onEdit={() => setEditing({ item, month: item.month })}
      onDelete={() => void remove(item)}
    />
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {([6, 12] as const).map((n) => (
            <button
              key={n}
              onClick={() => setSpan(n)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                span === n ? 'bg-background shadow' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {n} months
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing({ item: null, month: months[1] ?? thisMonth })}>
            <Plus /> Add item
          </Button>
          <Button
            variant="outline"
            onClick={() => void exportCsv()}
            loading={busy === 'export'}
            disabled={!items.length}
          >
            <Download /> Export CSV
          </Button>
          <Button onClick={() => setPlanOpen(true)} disabled={planRunning}>
            <Sparkles /> Plan my next {span} months
          </Button>
        </div>
      </div>

      <Callout>
        <span className="font-medium">Timing rule:</span> content goes up 2 to 3 months before the season
        people search for it. Google needs time to find and trust a new page, so a spring piece belongs in
        your winter months. Drag items between months to change the plan.
      </Callout>

      {planJob && planRunning && (
        <Callout title="Planning your calendar…">
          <span className="inline-flex items-center gap-2">
            <Spinner /> {planJob.progress ?? 'Waiting to start'}. This usually takes a minute or two. You can
            leave this screen.
          </span>
        </Callout>
      )}
      {planJob && planJob.status === 'failed' && dismissedJob !== planJob.id && (
        <Callout kind="error" title="The plan could not be made">
          {planJob.error ?? 'Something went wrong. Please try again.'}{' '}
          <button
            className="text-primary underline-offset-4 hover:underline"
            onClick={() => setDismissedJob(planJob.id)}
          >
            Dismiss
          </button>
        </Callout>
      )}
      {planJob && planJob.status === 'waiting_for_user' && (
        <Callout kind="warning" title="Planning is paused">
          {planJob.error ?? 'It needs your OK to continue.'} Open Activity (bottom left) to continue or cancel
          it.
        </Callout>
      )}

      <ErrorText error={error} />
      {loading && !data ? (
        <Loading label="Loading your calendar…" />
      ) : !items.length && !planRunning ? (
        <EmptyState
          icon={<CalendarPlus className="h-8 w-8" />}
          title="No content planned yet"
          action={
            <div className="flex gap-2">
              <Button onClick={() => setPlanOpen(true)}>
                <Sparkles /> Plan my next {span} months
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditing({ item: null, month: months[1] ?? thisMonth })}
              >
                <Plus /> Add an item myself
              </Button>
            </div>
          }
        >
          Let the AI plan a focus for each month with a main page and supporting posts, timed for when your
          customers search. Or add your own ideas.
        </EmptyState>
      ) : (
        <div className="-mx-1 overflow-x-auto pb-3">
          <div className="flex min-w-max gap-3 px-1">
            {earlier.length > 0 && (
              <div className="w-72 shrink-0 rounded-lg border border-dashed bg-muted/20 p-3">
                <div className="mb-1 text-sm font-semibold">Earlier months</div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Not done yet. Drag them into a coming month or mark them done.
                </p>
                <div className="space-y-2">{earlier.map(card)}</div>
              </div>
            )}
            {months.map((m) => {
              const list = byMonth.get(m) ?? []
              const focus = focusOf(list)
              return (
                <div
                  key={m}
                  data-testid={`month-${m}`}
                  {...dropProps(m)}
                  className={cn(
                    'flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 p-3 transition-colors',
                    dropTarget === m && 'border-primary bg-primary/5',
                    m === thisMonth && 'bg-muted/50'
                  )}
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">
                        {monthLabel(m)}
                        {m === thisMonth && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">this month</span>
                        )}
                      </div>
                      <div
                        className={cn(
                          'mt-0.5 truncate text-xs',
                          focus ? 'text-primary' : 'text-muted-foreground'
                        )}
                        title={focus ?? undefined}
                      >
                        {focus ? `Focus: ${focus}` : 'No focus set'}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={`Add to ${monthLabel(m)}`}
                      aria-label={`Add to ${monthLabel(m)}`}
                      onClick={() => setEditing({ item: null, month: m })}
                    >
                      <Plus />
                    </Button>
                  </div>
                  <div className="flex min-h-24 flex-1 flex-col gap-2">
                    {list.map(card)}
                    {!list.length && (
                      <div className="flex flex-1 items-center justify-center rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                        Nothing planned. Drop an item here or press +.
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <PlanDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        siteId={siteId}
        months={span}
        hasItems={items.length > 0}
        onStarted={() =>
          toast({ kind: 'info', title: 'Planning started', body: 'The calendar fills in when it is done.' })
        }
      />
      <ItemDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        siteId={siteId}
        months={months}
        item={editing?.item ?? null}
        defaultMonth={editing?.month ?? thisMonth}
        onSaved={() => void reload()}
      />
      {confirmDialog}
    </div>
  )
}

interface CardProps {
  item: CalendarItem
  dragging: boolean
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onStart: () => void
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}

function ItemCard({ item, dragging, onDragStart, onDragEnd, onStart, onOpen, onEdit, onDelete }: CardProps) {
  const main = item.itemType === 'main'
  const statusVariant =
    item.status === 'done'
      ? 'success'
      : item.status === 'started'
        ? 'default'
        : item.status === 'skipped'
          ? 'outline'
          : 'secondary'
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'group cursor-grab rounded-md border bg-card p-3 text-sm shadow-sm transition-opacity active:cursor-grabbing',
        main && 'border-l-4 border-l-primary',
        dragging && 'opacity-40',
        item.status === 'skipped' && 'opacity-60'
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
        <Badge variant={main ? 'default' : 'outline'}>{main ? 'Main page' : 'Supporting'}</Badge>
        <Badge variant={statusVariant}>{statusLabel(item.status)}</Badge>
        <div className="ml-auto flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onEdit}
            title="Edit"
            aria-label={`Edit ${item.title}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
            onClick={onDelete}
            title="Remove"
            aria-label={`Remove ${item.title}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="font-medium leading-snug">{item.title}</div>
      {item.keyword && <div className="mt-1 text-xs text-muted-foreground">Keyword: {item.keyword}</div>}
      {item.why && (
        <p className="mt-1.5 line-clamp-3 text-xs text-muted-foreground" title={item.why}>
          {item.why}
        </p>
      )}
      <div className="mt-2.5">
        {item.contentId ? (
          <Button size="sm" variant="outline" className="h-7 w-full" onClick={onOpen}>
            <ExternalLink /> Open
          </Button>
        ) : (
          <Button
            size="sm"
            variant={main ? 'default' : 'secondary'}
            className="h-7 w-full"
            onClick={onStart}
            disabled={item.status === 'skipped'}
          >
            <Play /> Start
          </Button>
        )}
      </div>
    </div>
  )
}

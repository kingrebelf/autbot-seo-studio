import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileText, PenSquare, Search, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useApi, useAction } from '@/hooks/useApi'
import { useSite } from '@/lib/app-context'
import { Page } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageHeader, EmptyState, Loading, ErrorText } from '@/components/ui/misc'
import { useConfirm } from '@/components/ui/confirm'
import { CONTENT_STATUSES } from '@shared/types'
import { cn, formatDate } from '@/lib/utils'

export const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'
> = {
  Idea: 'outline',
  Researching: 'secondary',
  'Awaiting choice': 'warning',
  Writing: 'secondary',
  Checking: 'secondary',
  'Ready for review': 'default',
  'Draft sent': 'success',
  Published: 'success',
  'Needs refresh': 'warning'
}

/** Pieces still in the wizard open there; everything else opens in the editor. */
export function contentHref(c: { id: number; status: string; mode: string }): string {
  return (c.status === 'Idea' || c.status === 'Researching' || c.status === 'Awaiting choice') &&
    c.mode !== 'D'
    ? `/new/${c.id}`
    : `/content/${c.id}`
}

export default function ContentList() {
  const site = useSite()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const [q, setQ] = useState('')
  const { data, error, loading, reload } = useApi(
    'content.list',
    { siteId: site.id },
    { refreshOnJobs: true }
  )
  const { run } = useAction()
  const [ask, confirmDialog] = useConfirm()

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of data ?? []) m.set(c.status, (m.get(c.status) ?? 0) + 1)
    return m
  }, [data])
  const rows = (data ?? []).filter(
    (c) =>
      (!status || c.status === status) &&
      (!q ||
        `${c.title ?? ''} ${c.topic ?? ''} ${c.focusKeyword ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  )

  return (
    <Page wide>
      {confirmDialog}
      <PageHeader
        title="Content"
        description="Everything you've planned, drafted and published for this site."
        actions={
          <Button onClick={() => nav('/new')}>
            <PenSquare /> New content
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          className={cn(
            'rounded-full border px-3 py-1 text-sm',
            !status ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
          )}
          onClick={() => setParams({})}
        >
          All <span className="text-muted-foreground">{data?.length ?? 0}</span>
        </button>
        {CONTENT_STATUSES.map((s) => (
          <button
            key={s}
            className={cn(
              'rounded-full border px-3 py-1 text-sm',
              status === s ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
            )}
            onClick={() => setParams({ status: s })}
          >
            {s} <span className="text-muted-foreground">{counts.get(s) ?? 0}</span>
          </button>
        ))}
        <div className="relative ml-auto w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search titles and keywords"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <ErrorText error={error} />
      {loading && !data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title={data?.length ? 'Nothing matches' : 'No content yet'}
          action={!data?.length && <Button onClick={() => nav('/new')}>Create your first piece</Button>}
        >
          {data?.length
            ? 'Try another status or search.'
            : 'Start with a topic you have in mind, or let the app suggest what to write next.'}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Target keyword</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium">Words</th>
                <th className="px-3 py-2 text-right font-medium">SEO</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => nav(contentHref(c))}
                >
                  <td className="max-w-md px-3 py-2">
                    <div className="truncate font-medium">{c.title || c.topic || 'Untitled'}</div>
                    {c.isPillar && (
                      <Badge variant="outline" className="mt-0.5">
                        Pillar page
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 capitalize">{c.type}</td>
                  <td className="px-3 py-2">
                    {c.focusKeyword ?? <span className="text-muted-foreground">–</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS_VARIANT[c.status] ?? 'outline'}>{c.status}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {formatDate(c.publishedAt ?? c.updatedAt)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.wordCount ? c.wordCount.toLocaleString() : '–'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.seoScore === null ? (
                      '–'
                    ) : (
                      <span
                        className={
                          c.seoScore >= 80
                            ? 'text-success'
                            : c.seoScore >= 50
                              ? 'text-warning'
                              : 'text-destructive'
                        }
                      >
                        {c.seoScore}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      aria-label="Delete"
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={async () => {
                        if (
                          await ask({
                            title: 'Delete this piece?',
                            body: `"${c.title || c.topic}" and its versions will be removed from the app. Anything already sent to WordPress stays there.`,
                            confirm: 'Delete',
                            danger: true
                          })
                        )
                          await run('del', async () => {
                            await api('content.delete', { id: c.id })
                            await reload()
                          })
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  )
}

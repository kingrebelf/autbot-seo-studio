import { Link, useNavigate } from 'react-router-dom'
import { Sparkles, ArrowRight, PenSquare, Wrench, CalendarDays } from 'lucide-react'
import { api } from '@/lib/api'
import { useApi, useAction } from '@/hooks/useApi'
import { useJobs } from '@/hooks/useJobs'
import { useSite } from '@/lib/app-context'
import { Page } from '@/components/layout/Layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader, Stat, Loading, ErrorText, Spinner } from '@/components/ui/misc'
import { money, timeAgo, monthLabel } from '@/lib/utils'

/** One suggestion from Mode B or Mode C (fields differ slightly). */
interface Suggestion {
  title?: string
  keyword?: string
  content_type?: string
  why?: string
  kind?: 'refresh' | 'supporting' | 'title_meta' | 'thin'
  page_url?: string | null
}

const KIND_LABEL: Record<string, string> = {
  refresh: 'Refresh a page',
  supporting: 'Supporting post',
  title_meta: 'Fix title and meta',
  thin: 'Beef up a thin page'
}

export function suggestionLink(s: Suggestion): string {
  if ((s.kind === 'refresh' || s.kind === 'title_meta' || s.kind === 'thin') && s.page_url)
    return `/new?mode=D&url=${encodeURIComponent(s.page_url)}&notes=${encodeURIComponent(s.why ?? '')}`
  const q = new URLSearchParams({
    mode: 'A',
    topic: s.keyword || s.title || '',
    notes: [s.title, s.why].filter(Boolean).join('. ')
  })
  if (s.content_type) q.set('type', s.content_type)
  return `/new?${q}`
}

export default function Home() {
  const site = useSite()
  const nav = useNavigate()
  const { data, error, loading } = useApi('dashboard.get', { siteId: site.id }, { refreshOnJobs: true })
  const jobs = useJobs(site.id)
  const { busy, run } = useAction()
  const suggesting = jobs.find(
    (j) => (j.type === 'mode-b' || j.type === 'mode-c') && (j.status === 'running' || j.status === 'queued')
  )

  if (loading && !data) return <Loading />
  const c = data?.cards
  const change = c?.avgPositionChange
  return (
    <Page>
      <PageHeader
        title={site.name}
        description={site.url}
        actions={
          <Button onClick={() => nav('/new')}>
            <PenSquare /> New content
          </Button>
        }
      />
      <ErrorText error={error} />
      {c && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Link to="/content?status=Ready%20for%20review">
            <Stat label="Drafts waiting" value={c.draftsWaiting} sub="Ready for your review" />
          </Link>
          <Stat label="Published" value={c.publishedThisMonth} sub="This month" />
          <Link to="/keywords">
            <Stat label="Keywords tracked" value={c.keywordsTracked} />
          </Link>
          <Stat
            label="Avg. position"
            value={
              change === null || change === undefined ? (
                '–'
              ) : (
                <span className={change > 0 ? 'text-success' : change < 0 ? 'text-destructive' : ''}>
                  {change > 0 ? `▲ ${change}` : change < 0 ? `▼ ${Math.abs(change)}` : '0'}
                </span>
              )
            }
            sub="Change, last 28 days"
          />
          <Stat label="AI spend" value={money(c.aiSpendThisMonth)} sub="This month" />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> What should I do next?
              </CardTitle>
              <CardDescription>
                {data?.suggestions.at
                  ? `From your last ${data.suggestions.from === 'mode-c' ? 'maintenance review' : 'review'}, ${timeAgo(data.suggestions.at)}.`
                  : 'Let the app look at your site and suggest your best next pieces.'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                loading={busy === 'C'}
                disabled={Boolean(suggesting)}
                onClick={() => run('C', () => api('modes.start', { siteId: site.id, mode: 'C' }))}
              >
                <Wrench /> Maintenance
              </Button>
              <Button
                size="sm"
                loading={busy === 'B'}
                disabled={Boolean(suggesting)}
                onClick={() => run('B', () => api('modes.start', { siteId: site.id, mode: 'B' }))}
              >
                <Sparkles /> Suggest
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {suggesting && (
              <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> {suggesting.progress ?? 'Working on suggestions…'}
              </div>
            )}
            {!data?.suggestions.items.length && !suggesting && (
              <p className="text-sm text-muted-foreground">
                No suggestions yet. Click Suggest to get your first three.
              </p>
            )}
            <ul className="divide-y">
              {(data?.suggestions.items as Suggestion[] | undefined)?.map((s, i) => (
                <li key={i} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{s.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1.5">
                      {s.keyword && <Badge variant="secondary">{s.keyword}</Badge>}
                      {s.content_type && <Badge variant="outline">{s.content_type}</Badge>}
                      {s.kind && <Badge variant="outline">{KIND_LABEL[s.kind]}</Badge>}
                    </div>
                    {s.why && <p className="mt-1 text-sm text-muted-foreground">{s.why}</p>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => nav(suggestionLink(s))}>
                    Start <ArrowRight />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Coming up
            </CardTitle>
            <CardDescription>From your content calendar.</CardDescription>
          </CardHeader>
          <CardContent>
            {!data?.upcoming.length && (
              <p className="text-sm text-muted-foreground">
                Nothing planned.{' '}
                <Link to="/plan" className="text-primary hover:underline">
                  Plan your next months
                </Link>
                .
              </p>
            )}
            <ul className="space-y-2">
              {data?.upcoming.map((u) => (
                <li key={u.id} className="flex items-start gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{u.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {monthLabel(u.month)} · {u.itemType === 'main' ? 'Main page' : 'Supporting post'}
                    </div>
                  </div>
                  {u.contentId ? (
                    <Button size="sm" variant="ghost" onClick={() => nav(`/content/${u.contentId}`)}>
                      Open
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        nav(
                          `/new?${new URLSearchParams({ mode: 'A', topic: u.keyword || u.title, notes: [u.title, u.why].filter(Boolean).join('. '), calendarItemId: String(u.id) })}`
                        )
                      }
                    >
                      Start
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.activity.length && (
            <p className="text-sm text-muted-foreground">
              Nothing yet. Activity from research, writing and publishing shows up here.
            </p>
          )}
          <ul className="divide-y text-sm">
            {data?.activity.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <span className="flex-1">
                  {a.link ? (
                    <Link to={a.link} className="hover:underline">
                      {a.message}
                    </Link>
                  ) : (
                    a.message
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </Page>
  )
}

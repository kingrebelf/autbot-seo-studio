import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, HeartPulse, RefreshCw, Wrench } from 'lucide-react'
import { Page } from '@/components/layout/Layout'
import { Callout, EmptyState, ErrorText, Loading, PageHeader, Spinner, Stat } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { useSite } from '@/lib/app-context'
import { useAction, useApi } from '@/hooks/useApi'
import { useJobs } from '@/hooks/useJobs'
import { formatDateTime, timeAgo } from '@/lib/utils'
import { PagesTable, refreshLink } from '@/components/health/PagesTable'
import { MaintenancePanel } from '@/components/health/MaintenancePanel'

export default function SiteHealth() {
  const site = useSite()
  const nav = useNavigate()
  const health = useApi('sites.health', { siteId: site.id })
  const latestC = useApi('modes.latest', { siteId: site.id, type: 'mode-c' }, { refreshOnJobs: true })
  const jobs = useJobs(site.id)
  const { busy, run } = useAction()

  const latestOf = (type: string) =>
    jobs.filter((j) => j.type === type && j.siteId === site.id).sort((a, b) => b.id - a.id)[0] ?? null
  const crawlJob = latestOf('crawl')
  const modeCJob = latestOf('mode-c')
  const crawling = crawlJob !== null && (crawlJob.status === 'running' || crawlJob.status === 'queued')
  const reviewing = modeCJob !== null && (modeCJob.status === 'running' || modeCJob.status === 'queued')

  // Reload the audit when a crawl finishes (and keep it fresh while one runs).
  const prevCrawl = useRef<string | null>(null)
  const { reload } = health
  useEffect(() => {
    const st = crawlJob?.status ?? null
    if (prevCrawl.current && prevCrawl.current !== st && (st === 'done' || crawling)) void reload()
    if (prevCrawl.current && prevCrawl.current !== 'failed' && st === 'failed')
      toast({ kind: 'error', title: 'The crawl stopped', body: crawlJob?.error ?? undefined })
    prevCrawl.current = st
  }, [crawlJob?.status, crawlJob?.progress, crawlJob?.error, crawling, reload])

  const data = health.data
  const lastCrawl = data?.lastCrawl ?? data?.lastCrawled ?? null
  const pagesWithIssues = useMemo(() => data?.pages.filter((p) => p.issues.length > 0).length ?? 0, [data])

  const crawl = () =>
    run('crawl', async () => {
      await api('sites.crawl', { siteId: site.id })
      toast({
        kind: 'info',
        title: 'Crawl started',
        body: 'Reading your site one page per second. You can keep working.'
      })
    })

  const review = () =>
    run('review', async () => {
      await api('modes.start', { siteId: site.id, mode: 'C' })
      void latestC.reload()
    })

  return (
    <Page wide>
      <PageHeader
        title="Site Health"
        description="A check-up of the pages on your site: missing titles, thin pages, pages nobody links to, and pages competing for the same search."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => void review()}
              loading={busy === 'review'}
              disabled={reviewing}
            >
              {busy !== 'review' && <Wrench />} Maintenance review
            </Button>
            <Button onClick={() => void crawl()} loading={busy === 'crawl'} disabled={crawling}>
              {busy !== 'crawl' && <RefreshCw className={crawling ? 'animate-spin' : undefined} />}{' '}
              {crawling ? 'Crawling…' : 'Crawl now'}
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        {crawling && crawlJob && (
          <Callout title="Crawling your site…">
            <span className="inline-flex items-center gap-2">
              <Spinner />{' '}
              {crawlJob.progress ?? (crawlJob.status === 'queued' ? 'Waiting to start' : 'Starting')}. The
              table below updates as pages come in.
            </span>
          </Callout>
        )}

        <ErrorText error={health.error} />

        {health.loading && !data ? (
          <Loading label="Checking your pages…" />
        ) : !data || !data.pages.length ? (
          <EmptyState
            icon={<HeartPulse className="h-8 w-8" />}
            title={crawling ? 'Crawling your site…' : 'No pages checked yet'}
            action={
              !crawling && (
                <Button onClick={() => void crawl()} loading={busy === 'crawl'}>
                  <RefreshCw /> Crawl now
                </Button>
              )
            }
          >
            The app reads your sitemap (or follows links from your homepage) and checks each page. It runs
            politely at one page per second, so a big site can take a few minutes.
          </EmptyState>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label="Pages"
                value={data.pages.length}
                sub={`${pagesWithIssues} with something to fix`}
              />
              <Stat label="Issues" value={data.issues} sub="Across all pages" />
              <Stat label="Orphan pages" value={data.orphans} sub="No links point to them" />
              <Stat
                label="Last crawl"
                value={lastCrawl ? timeAgo(lastCrawl) : 'Never'}
                sub={lastCrawl ? formatDateTime(lastCrawl) : 'Press Crawl now'}
              />
            </div>

            <MaintenancePanel
              job={latestC.data ?? undefined}
              running={reviewing}
              progress={modeCJob?.progress ?? null}
            />
            {!latestC.data && !reviewing && (
              <Callout>
                <span className="font-medium">Maintenance review</span> looks for pages ranking just off page
                one, pages losing clicks, and thin pages, then suggests what to refresh or write next. It
                works best with Google Search Console connected.
              </Callout>
            )}

            {data.cannibalization.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Copy className="h-4 w-4" /> Pages competing with each other
                  </CardTitle>
                  <CardDescription>
                    When two of your pages chase the same search, Google often shows neither well. Make one
                    the clear main page (refresh it, and link to it from the others), or merge them.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.cannibalization.map((g, i) => (
                    <div key={i} className="rounded-md border p-3">
                      <div className="mb-2 text-sm font-medium">{g.reason}</div>
                      <ul className="space-y-1.5">
                        {g.urls.map((u) => (
                          <li key={u} className="flex items-center gap-3 text-sm">
                            <a
                              href={u}
                              target="_blank"
                              rel="noreferrer"
                              className="min-w-0 flex-1 truncate text-muted-foreground hover:text-primary"
                              title={u}
                            >
                              {u}
                            </a>
                            <Button size="sm" variant="outline" onClick={() => nav(refreshLink(u))}>
                              <RefreshCw /> Refresh this page
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <div>
              <h2 className="mb-3 text-lg font-semibold">Pages</h2>
              <PagesTable pages={data.pages} />
            </div>
          </>
        )}
      </div>
    </Page>
  )
}

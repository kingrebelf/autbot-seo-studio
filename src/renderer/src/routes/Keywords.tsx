import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpDown, Download, FileUp, Plus, RefreshCw, Search, Trash2, TrendingUp } from 'lucide-react'
import { Page } from '@/components/layout/Layout'
import { Callout, EmptyState, ErrorText, Loading, PageHeader } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { api } from '@/lib/api'
import { useSite } from '@/lib/app-context'
import { useAction, useApi } from '@/hooks/useApi'
import { cn } from '@/lib/utils'
import { Change, formatPosition, shortUrl, sourceLabel, type KeywordView } from '@/components/keywords/shared'
import { KeywordDetail } from '@/components/keywords/KeywordDetail'
import { AddKeywordDialog, ImportDialog } from '@/components/keywords/KeywordDialogs'
import { WinnersLosers } from '@/components/keywords/WinnersLosers'

type SortKey = 'keyword' | 'group' | 'position' | 'change' | 'clicks' | 'impressions'

const NO_GROUP = '__none__'

function sortValue(k: KeywordView, key: SortKey): string | number {
  switch (key) {
    case 'keyword':
      return k.keyword.toLowerCase()
    case 'group':
      return (k.groupName ?? '~').toLowerCase()
    case 'position':
      return k.position ?? 1e9
    case 'change':
      return k.change28 ?? -1e9
    case 'clicks':
      return k.clicks28
    case 'impressions':
      return k.impressions28
  }
}

export default function Keywords() {
  const site = useSite()
  const list = useApi('keywords.list', { siteId: site.id }, { refreshOnJobs: true })
  const wl = useApi('keywords.winnersLosers', { siteId: site.id }, { refreshOnJobs: true })
  const { busy, run } = useAction()
  const [ask, confirmDialog] = useConfirm()
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'keyword', desc: false })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [showSources, setShowSources] = useState(false)

  const keywords = useMemo(() => list.data ?? [], [list.data])
  const groups = useMemo(
    () => [...new Set(keywords.map((k) => k.groupName).filter((g): g is string => Boolean(g)))].sort(),
    [keywords]
  )
  const selected = keywords.find((k) => k.id === selectedId) ?? null

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = keywords.filter(
      (k) =>
        (!q || k.keyword.toLowerCase().includes(q) || (k.targetPageUrl ?? '').toLowerCase().includes(q)) &&
        (!group || (group === NO_GROUP ? !k.groupName : k.groupName === group))
    )
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sort.key)
      const vb = sortValue(b, sort.key)
      const c = va < vb ? -1 : va > vb ? 1 : 0
      return sort.desc ? -c : c
    })
  }, [keywords, search, group, sort])

  const reloadAll = () => {
    void list.reload()
    void wl.reload()
  }

  const checkNow = () =>
    run(
      'check',
      async () => {
        await api('keywords.checkNow', { siteId: site.id })
        setCheckError(null)
        toast({
          kind: 'info',
          title: 'Checking rankings',
          body: 'This runs in the background. The table updates when new numbers arrive.'
        })
      },
      setCheckError
    )

  const exportCsv = () =>
    run('export', async () => {
      const path = await api('keywords.exportCsv', { siteId: site.id })
      if (path) toast({ kind: 'success', title: 'Keywords exported', body: path })
    })

  const remove = async (k: KeywordView) => {
    if (
      !(await ask({
        title: `Stop tracking "${k.keyword}"?`,
        body: 'Its position history is deleted too. You can add it again later, but the history will start over.',
        confirm: 'Stop tracking',
        danger: true
      }))
    )
      return
    await run('remove', () => api('keywords.remove', { id: k.id }))
    if (selectedId === k.id) setSelectedId(null)
    reloadAll()
  }

  const header = (key: SortKey, label: string, right = false) => (
    <th className={cn('px-3 py-2 font-medium', right && 'text-right')}>
      <button
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground',
          sort.key === key && 'text-foreground'
        )}
        onClick={() =>
          setSort((s) => ({
            key,
            desc: s.key === key ? !s.desc : key === 'clicks' || key === 'impressions' || key === 'change'
          }))
        }
      >
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-60" />
      </button>
    </th>
  )

  return (
    <Page wide>
      <PageHeader
        title="Keywords"
        description="Where you show up on Google for the searches that matter, and how that changes over time."
        actions={
          <>
            <Button variant="outline" onClick={() => void checkNow()} loading={busy === 'check'}>
              {busy !== 'check' && <RefreshCw />} Check now
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp /> Import CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => void exportCsv()}
              loading={busy === 'export'}
              disabled={!keywords.length}
            >
              <Download /> Export CSV
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus /> Add keyword
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        {checkError && (
          <Callout kind="warning" title="Rankings can't be checked automatically yet">
            {checkError}{' '}
            <Link
              to="/settings/google"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Open Settings &gt; Google
            </Link>{' '}
            or{' '}
            <Link to="/settings/data" className="font-medium text-primary underline-offset-4 hover:underline">
              Settings &gt; Data Sources
            </Link>
            .
          </Callout>
        )}

        <Callout>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Positions come from up to three places, so the numbers can differ slightly.</span>
            <button
              className="text-primary underline-offset-4 hover:underline"
              onClick={() => setShowSources((s) => !s)}
            >
              {showSources ? 'Hide' : 'Where do the numbers come from?'}
            </button>
          </div>
          {showSources && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <span className="font-medium">Search Console (free):</span> Google&apos;s own average position
                across all the people who saw you, plus clicks and impressions. About 2 to 3 days behind.
                Position 8.4 means &quot;usually around 8th&quot;.
              </li>
              <li>
                <span className="font-medium">DataForSEO (optional, paid):</span> the exact position in one
                live Google search for your town and device. More precise for local businesses, but a single
                snapshot.
              </li>
              <li>
                <span className="font-medium">Typed in or CSV import:</span> numbers you checked yourself or
                brought from tools like Wincher, SEMrush or Ahrefs.
              </li>
            </ul>
          )}
        </Callout>

        <ErrorText error={list.error} />

        {list.loading && !list.data ? (
          <Loading label="Loading keywords…" />
        ) : !keywords.length ? (
          <EmptyState
            icon={<TrendingUp className="h-8 w-8" />}
            title="No keywords tracked yet"
            action={
              <div className="flex gap-2">
                <Button onClick={() => setAddOpen(true)}>
                  <Plus /> Add keyword
                </Button>
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <FileUp /> Import CSV
                </Button>
              </div>
            }
          >
            Keywords from content you publish are added automatically. You can also add the searches you care
            about now, or import them from another tool. Connect Google Search Console in{' '}
            <Link to="/settings/google" className="text-primary underline-offset-4 hover:underline">
              Settings &gt; Google
            </Link>{' '}
            to fill in positions for free.
          </EmptyState>
        ) : (
          <>
            <WinnersLosers data={wl.data} onPick={(k) => setSelectedId(k.id)} />

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-72">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search keywords or pages"
                  className="pl-8"
                  aria-label="Search keywords"
                />
              </div>
              {groups.length > 0 && (
                <Select
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  className="w-56"
                  aria-label="Filter by group"
                >
                  <option value="">All groups</option>
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                  <option value={NO_GROUP}>No group</option>
                </Select>
              )}
              <span className="ml-auto text-sm text-muted-foreground">
                {rows.length} of {keywords.length} keyword{keywords.length === 1 ? '' : 's'}
              </span>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      {header('keyword', 'Keyword')}
                      {header('group', 'Group')}
                      <th className="px-3 py-2 font-medium">Target page</th>
                      {header('position', 'Position', true)}
                      {header('change', '28-day change', true)}
                      {header('clicks', 'Clicks', true)}
                      {header('impressions', 'Impressions', true)}
                      <th className="px-3 py-2 font-medium">Source</th>
                      <th className="px-3 py-2 text-right font-medium">Data points</th>
                      <th className="w-10 px-3 py-2">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((k) => {
                      const src = sourceLabel(k.latestSource)
                      return (
                        <tr
                          key={k.id}
                          className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                          onClick={() => setSelectedId(k.id)}
                        >
                          <td className="px-3 py-2 font-medium">
                            <button
                              className="text-left hover:text-primary hover:underline"
                              onClick={() => setSelectedId(k.id)}
                            >
                              {k.keyword}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{k.groupName ?? '–'}</td>
                          <td
                            className="max-w-[220px] truncate px-3 py-2 text-muted-foreground"
                            title={k.targetPageUrl ?? undefined}
                          >
                            {shortUrl(k.targetPageUrl) || '–'}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {formatPosition(k.position)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <Change value={k.change28} />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{k.clicks28.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {k.impressions28.toLocaleString()}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={k.latestSource ? 'secondary' : 'outline'} title={src.hint}>
                              {src.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {k.points}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                              title="Stop tracking"
                              aria-label={`Stop tracking ${k.keyword}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                void remove(k)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {!rows.length && (
                      <tr>
                        <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                          No keywords match. Clear the search or pick another group.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="text-xs text-muted-foreground">
              Click a keyword to see its chart, change its group or target page, or type in a position.
            </p>
          </>
        )}
      </div>

      <KeywordDetail
        keyword={selected}
        groups={groups}
        onClose={() => setSelectedId(null)}
        onChanged={reloadAll}
        onRemove={(k) => void remove(k)}
      />
      <AddKeywordDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        siteId={site.id}
        groups={groups}
        onAdded={reloadAll}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} siteId={site.id} onImported={reloadAll} />
      {confirmDialog}
    </Page>
  )
}

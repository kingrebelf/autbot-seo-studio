import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, RefreshCw, Search } from 'lucide-react'
import type { RouteOutput } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export type HealthPage = RouteOutput<'sites.health'>['pages'][number]
type Filter = 'issues' | 'orphans' | 'all'

export function refreshLink(url: string): string {
  return `/new?${new URLSearchParams({ mode: 'D', url }).toString()}`
}

function pathOf(u: string): string {
  try {
    const url = new URL(u)
    return url.pathname + url.search
  } catch {
    return u
  }
}

export function PagesTable({ pages }: { pages: HealthPage[] }) {
  const nav = useNavigate()
  const withIssues = pages.filter((p) => p.issues.length > 0).length
  const orphans = pages.filter((p) => p.inbound === 0).length
  const [filter, setFilter] = useState<Filter>(withIssues ? 'issues' : 'all')
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return pages
      .filter((p) =>
        filter === 'issues' ? p.issues.length > 0 : filter === 'orphans' ? p.inbound === 0 : true
      )
      .filter((p) => !q || p.url.toLowerCase().includes(q) || (p.title ?? '').toLowerCase().includes(q))
      .sort((a, b) => b.issues.length - a.issues.length || a.url.localeCompare(b.url))
  }, [pages, filter, search])

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'issues', label: 'With issues', count: withIssues },
    { key: 'orphans', label: 'Orphans', count: orphans },
    { key: 'all', label: 'All pages', count: pages.length }
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Filter pages">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={filter === t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                filter === t.key ? 'bg-background shadow' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label} <span className="ml-1 text-xs text-muted-foreground">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pages"
            className="pl-8"
            aria-label="Search pages"
          />
        </div>
      </div>
      {filter === 'orphans' && (
        <p className="text-sm text-muted-foreground">
          Orphan pages have no links from your other pages, so visitors and Google struggle to find them. Link
          to them from related pages.
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Page</th>
                <th className="px-3 py-2 text-right font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Words</th>
                <th
                  className="px-3 py-2 text-right font-medium"
                  title="Links from your other pages to this one"
                >
                  Links in
                </th>
                <th
                  className="px-3 py-2 text-right font-medium"
                  title="Links from this page to your other pages"
                >
                  Links out
                </th>
                <th className="px-3 py-2 font-medium">Issues</th>
                <th className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const code = p.statusCode ?? null
                return (
                  <tr key={p.id} className="border-b align-top last:border-0">
                    <td className="max-w-[340px] px-3 py-2">
                      <div className="truncate font-medium" title={p.title ?? undefined}>
                        {p.title || <span className="italic text-muted-foreground">No title</span>}
                      </div>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary"
                        title={p.url}
                      >
                        <span className="truncate">{pathOf(p.url)}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {code === null ? (
                        <span className="text-muted-foreground">–</span>
                      ) : (
                        <Badge variant={code >= 400 ? 'destructive' : code >= 300 ? 'warning' : 'success'}>
                          {code}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.wordCount ?? '–'}</td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right tabular-nums',
                        p.inbound === 0 && 'font-medium text-warning'
                      )}
                    >
                      {p.inbound}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.outbound}</td>
                    <td className="px-3 py-2">
                      {p.issues.length ? (
                        <ul className="space-y-0.5">
                          {p.issues.map((i) => (
                            <li key={i} className="text-xs">
                              • {i}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-success">Looks good</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => nav(refreshLink(p.url))}
                        title="Make an improved version of this page"
                      >
                        <RefreshCw /> Refresh
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    {filter === 'issues'
                      ? 'No pages with issues. Nice work.'
                      : filter === 'orphans'
                        ? 'No orphan pages. Every page has a link pointing to it.'
                        : 'No pages match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

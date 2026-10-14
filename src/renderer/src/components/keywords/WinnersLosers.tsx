import { TrendingDown, TrendingUp } from 'lucide-react'
import type { RouteOutput } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Change, formatPosition, type KeywordView } from './shared'

type WL = RouteOutput<'keywords.winnersLosers'>

function List({
  items,
  empty,
  onPick
}: {
  items: KeywordView[]
  empty: string
  onPick: (k: KeywordView) => void
}) {
  if (!items.length) return <p className="py-2 text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="divide-y">
      {items.map((k) => (
        <li key={k.id}>
          <button
            className="flex w-full items-center gap-3 py-1.5 text-left text-sm hover:text-primary"
            onClick={() => onPick(k)}
          >
            <span className="min-w-0 flex-1 truncate">{k.keyword}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              now {formatPosition(k.position)}
            </span>
            <Change value={k.change28} className="w-12 justify-end tabular-nums" />
          </button>
        </li>
      ))}
    </ul>
  )
}

export function WinnersLosers({ data, onPick }: { data: WL | undefined; onPick: (k: KeywordView) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-success" /> Winners, last 28 days
          </CardTitle>
        </CardHeader>
        <CardContent>
          <List
            items={data?.winners ?? []}
            empty="No keyword has moved up yet. Give it a few weeks after publishing."
            onPick={onPick}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingDown className="h-4 w-4 text-destructive" /> Losers, last 28 days
          </CardTitle>
        </CardHeader>
        <CardContent>
          <List items={data?.losers ?? []} empty="Nothing has dropped. Good news." onPick={onPick} />
        </CardContent>
      </Card>
    </div>
  )
}

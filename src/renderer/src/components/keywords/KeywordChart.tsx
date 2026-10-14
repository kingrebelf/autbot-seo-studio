import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { RouteOutput } from '@/lib/api'
import { cn } from '@/lib/utils'
import { sourceLabel } from './shared'

type ChartData = RouteOutput<'keywords.chart'>

const DAY = 86_400_000
const toTs = (d: string) => new Date(`${d}T00:00:00`).getTime()
const fmtDay = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const fmtFull = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

const AXIS = { stroke: 'hsl(var(--muted-foreground))', fontSize: 12 }
const GRID = 'hsl(var(--border))'
const LINE = 'hsl(var(--primary))'
const MARKER = 'hsl(var(--warning))'

interface Point {
  ts: number
  position: number | null
  clicks: number
  impressions: number
  source: string
}

interface TipProps {
  active?: boolean
  payload?: { payload: Point }[]
  metric: 'position' | 'clicks' | 'impressions'
}

function Tip({ active, payload, metric }: TipProps) {
  const p = payload?.[0]?.payload
  if (!active || !p) return null
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
      <div className="font-medium">{fmtFull(p.ts)}</div>
      {metric === 'position' ? (
        <>
          <div className="mt-0.5">Position {p.position === null ? 'not ranking' : p.position}</div>
          <div className="text-muted-foreground">{sourceLabel(p.source).label}</div>
        </>
      ) : (
        <div className="mt-0.5">
          {p[metric].toLocaleString()} {metric}
        </div>
      )}
    </div>
  )
}

/** Position over time (1 at the top), plus clicks or impressions, with publish markers. */
export function KeywordChart({ data }: { data: ChartData }) {
  const [metric, setMetric] = useState<'clicks' | 'impressions'>('clicks')
  const points = useMemo<Point[]>(
    () =>
      data.series.map((s) => ({
        ts: toTs(s.date),
        position: s.position,
        clicks: s.clicks,
        impressions: s.impressions,
        source: s.source
      })),
    [data]
  )
  const markers = useMemo(() => data.markers.map((m) => ({ ...m, ts: toTs(m.date) })), [data])
  const hasTraffic = points.some((p) => p.clicks > 0 || p.impressions > 0)

  const domain = useMemo<[number, number]>(() => {
    const all = [...points.map((p) => p.ts), ...markers.map((m) => m.ts)]
    if (!all.length) return [Date.now() - 30 * DAY, Date.now()]
    const lo = Math.min(...all)
    const hi = Math.max(...all)
    return lo === hi ? [lo - 3 * DAY, hi + 3 * DAY] : [lo, hi]
  }, [points, markers])

  const markerLines = markers.map((m) => (
    <ReferenceLine
      key={`${m.contentId}-${m.date}`}
      x={m.ts}
      stroke={MARKER}
      strokeDasharray="4 3"
      strokeWidth={1.5}
      label={{
        value: m.title.length > 28 ? `${m.title.slice(0, 27)}…` : m.title,
        position: 'insideTopRight',
        fill: 'hsl(var(--foreground))',
        fontSize: 11
      }}
    />
  ))

  const xAxis = (
    <XAxis
      dataKey="ts"
      type="number"
      scale="time"
      domain={domain}
      tickFormatter={fmtDay}
      tick={AXIS}
      stroke={GRID}
      minTickGap={32}
    />
  )

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h4 className="text-sm font-semibold">Position over time</h4>
          <span className="text-xs text-muted-foreground">
            Higher on the chart is better (1 = top of Google)
          </span>
        </div>
        <div className="h-64" role="img" aria-label={`Position over time for ${data.keyword.keyword}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 18, right: 16, bottom: 4, left: -8 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              {xAxis}
              <YAxis
                reversed
                domain={[1, 'dataMax']}
                allowDecimals={false}
                tick={AXIS}
                stroke={GRID}
                width={44}
              />
              <Tooltip content={<Tip metric="position" />} />
              {markerLines}
              <Line
                type="monotone"
                dataKey="position"
                stroke={LINE}
                strokeWidth={2}
                dot={points.length < 30 ? { r: 3, strokeWidth: 0, fill: LINE } : false}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {markers.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            <span
              className="mr-1 inline-block h-0 w-4 border-t-2 border-dashed align-middle"
              style={{ borderColor: MARKER }}
            />
            Dashed lines show when related content was published, so you can see cause and effect.
          </p>
        )}
      </div>

      {hasTraffic && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold">Search traffic</h4>
            <div className="flex gap-1 rounded-md bg-muted p-0.5 text-xs">
              {(['clicks', 'impressions'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={cn(
                    'rounded px-2 py-0.5 capitalize',
                    metric === m ? 'bg-background shadow' : 'text-muted-foreground'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="h-44" role="img" aria-label={`${metric} over time`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                {xAxis}
                <YAxis allowDecimals={false} tick={AXIS} stroke={GRID} width={44} />
                <Tooltip content={<Tip metric={metric} />} />
                {markerLines}
                <Line
                  type="monotone"
                  dataKey={metric}
                  stroke={LINE}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Clicks and impressions come from Google Search Console.
          </p>
        </div>
      )}
    </div>
  )
}

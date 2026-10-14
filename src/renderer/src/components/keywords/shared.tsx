import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { RouteOutput } from '@/lib/api'
import { cn } from '@/lib/utils'

export type KeywordView = RouteOutput<'keywords.list'>[number]

/** 28-day change. Positive = moved up (a smaller position number). */
export function Change({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className={cn('text-muted-foreground', className)}>–</span>
  if (value === 0)
    return (
      <span className={cn('inline-flex items-center gap-0.5 text-muted-foreground', className)}>
        <Minus className="h-3.5 w-3.5" /> 0
      </span>
    )
  const up = value > 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-medium',
        up ? 'text-success' : 'text-destructive',
        className
      )}
      title={up ? `Up ${value} places in 28 days` : `Down ${-value} places in 28 days`}
    >
      {up ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
      {Math.abs(value)}
    </span>
  )
}

const SOURCE_LABELS: Record<string, { label: string; hint: string }> = {
  GSC: {
    label: 'Search Console',
    hint: 'Google Search Console average position (free, about 2 to 3 days behind)'
  },
  DataForSEO: {
    label: 'DataForSEO',
    hint: 'Exact position from a live Google search for your location and device'
  },
  Manual: { label: 'Typed in', hint: 'A position you entered by hand' },
  CSV: { label: 'CSV import', hint: 'Imported from a CSV file (e.g. Wincher, SEMrush or Ahrefs)' },
  Auto: { label: 'Auto', hint: 'Added automatically from published content' }
}

export function sourceLabel(s: string | null): { label: string; hint: string } {
  if (!s)
    return {
      label: 'No data yet',
      hint: 'No position recorded yet. Connect Search Console, run Check now, or type a position in.'
    }
  return SOURCE_LABELS[s] ?? { label: s, hint: s }
}

export function formatPosition(p: number | null): string {
  if (p === null) return '–'
  return Number.isInteger(p) ? String(p) : p.toFixed(1)
}

export function shortUrl(u: string | null): string {
  if (!u) return ''
  try {
    const url = new URL(u)
    return url.pathname === '/' ? url.host : url.pathname
  } catch {
    return u
  }
}

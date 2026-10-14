import { useState } from 'react'
import { Lightbulb, Sparkles, ShieldCheck, RefreshCw, Network, MapPin, CalendarRange } from 'lucide-react'
import type { Mode } from '@shared/types'
import { cn } from '@/lib/utils'

export const MODES: { mode: Mode; title: string; body: string; icon: typeof Lightbulb }[] = [
  {
    mode: 'A',
    title: 'I have a topic in mind',
    body: 'Type a topic, product or service. The app researches the best keyword for it.',
    icon: Lightbulb
  },
  {
    mode: 'B',
    title: "Tell me what's next",
    body: 'The app reviews your site, Search Console and competitors and recommends your 5 best next pieces.',
    icon: Sparkles
  },
  {
    mode: 'C',
    title: "Maintenance: protect what's ranking",
    body: 'Find pages close to page one, pages losing clicks, and titles that need a better click rate.',
    icon: ShieldCheck
  },
  {
    mode: 'D',
    title: 'Refresh an existing page',
    body: 'Pick a page. The app suggests improvements and writes an updated draft. Your live page is never changed.',
    icon: RefreshCw
  },
  {
    mode: 'E',
    title: 'Build a set',
    body: 'One main "pillar" page plus 3 to 8 supporting posts that link to it, planned and written as a batch.',
    icon: Network
  },
  {
    mode: 'F',
    title: 'Local pages',
    body: 'One genuinely different page per town or area you serve.',
    icon: MapPin
  },
  {
    mode: 'G',
    title: 'Plan my next 6 months',
    body: 'A month-by-month content calendar timed for when people search.',
    icon: CalendarRange
  }
]

export function ModePicker({ value, onPick }: { value: Mode | null; onPick: (m: Mode) => void }) {
  const [hover, setHover] = useState<Mode | null>(null)
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {MODES.map((m) => (
        <button
          key={m.mode}
          onClick={() => onPick(m.mode)}
          onMouseEnter={() => setHover(m.mode)}
          onMouseLeave={() => setHover(null)}
          className={cn(
            'flex flex-col items-start gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary',
            value === m.mode && 'border-primary bg-primary/5 ring-1 ring-primary'
          )}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md bg-muted',
                (value === m.mode || hover === m.mode) && 'bg-primary text-primary-foreground'
              )}
            >
              <m.icon className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold text-muted-foreground">{m.mode}</span>
          </div>
          <div className="font-semibold">{m.title}</div>
          <div className="text-sm text-muted-foreground">{m.body}</div>
        </button>
      ))}
    </div>
  )
}

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A titled block inside a right-panel tab. */
export function Section({
  title,
  hint,
  actions,
  children,
  className
}: {
  title: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-2', className)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {actions && <div className="flex shrink-0 gap-1">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

/** Small "n characters" counter that turns green inside the ideal range. */
export function Counter({ n, min, max }: { n: number; min: number; max: number }) {
  const ok = n >= min && n <= max
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        ok ? 'text-success' : n === 0 ? 'text-muted-foreground' : 'text-warning'
      )}
    >
      {n} characters · ideal {min}–{max}
    </span>
  )
}

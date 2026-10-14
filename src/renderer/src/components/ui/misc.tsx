import * as React from 'react'
import { AlertTriangle, Info, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />
}

export function PageHeader({
  title,
  description,
  actions
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  children,
  action
}: {
  icon?: React.ReactNode
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-10 text-center">
      {icon && <div className="mb-3 text-muted-foreground">{icon}</div>}
      <h3 className="font-semibold">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Callout({
  kind = 'info',
  title,
  children,
  className
}: {
  kind?: 'info' | 'warning' | 'error' | 'success'
  title?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  const Icon =
    kind === 'warning' ? AlertTriangle : kind === 'error' ? XCircle : kind === 'success' ? CheckCircle2 : Info
  const tone = {
    info: 'border-border bg-muted/50',
    warning: 'border-warning/40 bg-warning/10',
    error: 'border-destructive/40 bg-destructive/10',
    success: 'border-success/40 bg-success/10'
  }[kind]
  const iconTone = {
    info: 'text-muted-foreground',
    warning: 'text-warning',
    error: 'text-destructive',
    success: 'text-success'
  }[kind]
  return (
    <div
      className={cn('flex gap-3 rounded-md border p-3 text-sm', tone, className)}
      role={kind === 'error' ? 'alert' : undefined}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconTone)} />
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={cn(title && 'mt-0.5', 'text-foreground/90')}>{children}</div>}
      </div>
    </div>
  )
}

export function ErrorText({ error }: { error?: string | null }) {
  if (!error) return null
  return <Callout kind="error">{error}</Callout>
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-muted-foreground">
      <Spinner /> {label}
    </div>
  )
}

export function ScoreRing({ score, size = 56 }: { score: number | null | undefined; size?: number }) {
  const s = score ?? 0
  const r = size / 2 - 5
  const c = 2 * Math.PI * r
  const color = s >= 80 ? 'hsl(var(--success))' : s >= 50 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))'
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`SEO score ${score ?? 'not scored'}`}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeDasharray={`${(s / 100) * c} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-foreground text-sm font-semibold"
      >
        {score ?? '–'}
      </text>
    </svg>
  )
}

export function Stat({
  label,
  value,
  sub
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

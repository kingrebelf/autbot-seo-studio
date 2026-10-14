import { useEffect, useState } from 'react'
import { X, CheckCircle2, XCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ToastMsg {
  kind?: 'success' | 'error' | 'info'
  title: string
  body?: string
  action?: { label: string; href?: string; onClick?: () => void }
}

/** Show a toast from anywhere. */
export function toast(t: ToastMsg): void {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: t }))
}

export function Toaster() {
  const [items, setItems] = useState<(ToastMsg & { id: number })[]>([])
  useEffect(() => {
    let n = 0
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<ToastMsg>).detail
      const id = ++n
      setItems((xs) => [...xs.slice(-4), { ...t, id }])
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.kind === 'error' ? 9000 : 5000)
    }
    window.addEventListener('app-toast', onToast)
    return () => window.removeEventListener('app-toast', onToast)
  }, [])
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-96 flex-col gap-2">
      {items.map((t) => {
        const Icon = t.kind === 'error' ? XCircle : t.kind === 'success' ? CheckCircle2 : Info
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex gap-3 rounded-lg border bg-background p-3 shadow-lg',
              t.kind === 'error' && 'border-destructive/50'
            )}
          >
            <Icon
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                t.kind === 'error'
                  ? 'text-destructive'
                  : t.kind === 'success'
                    ? 'text-success'
                    : 'text-muted-foreground'
              )}
            />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium">{t.title}</div>
              {t.body && <div className="mt-0.5 text-muted-foreground">{t.body}</div>}
              {t.action && (
                <button
                  className="mt-1 text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    if (t.action?.href) window.location.hash = t.action.href
                    t.action?.onClick?.()
                    setItems((xs) => xs.filter((x) => x.id !== t.id))
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button aria-label="Dismiss" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Home,
  PenSquare,
  FileText,
  CalendarDays,
  TrendingUp,
  HeartPulse,
  Image as ImageIcon,
  Settings,
  Activity,
  Bell,
  Plus
} from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { useJobs } from '@/hooks/useJobs'
import { cn } from '@/lib/utils'
import { Select } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { ActivityDrawer } from './ActivityDrawer'
import { NotificationsPanel } from './NotificationsPanel'

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/new', label: 'New Content', icon: PenSquare },
  { to: '/content', label: 'Content', icon: FileText },
  { to: '/plan', label: 'Plan', icon: CalendarDays },
  { to: '/keywords', label: 'Keywords', icon: TrendingUp },
  { to: '/health', label: 'Site Health', icon: HeartPulse },
  { to: '/images', label: 'Images', icon: ImageIcon },
  { to: '/settings', label: 'Settings', icon: Settings }
]

export function Layout() {
  const { sites, site, setActiveSite, info, settings } = useApp()
  const nav = useNavigate()
  const jobs = useJobs(site?.id ?? null)
  const [activityOpen, setActivityOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const active = jobs.filter((j) => j.status === 'running' || j.status === 'queued').length
  const waiting = jobs.filter((j) => j.status === 'waiting_for_user' && j.step === 'budget').length

  useEffect(
    () =>
      window.api.on('notify', (p) => {
        const n = p as { title: string; body?: string; link?: string }
        toast({
          kind: 'info',
          title: n.title,
          body: n.body,
          action: n.link ? { label: 'Open', href: `#${n.link}` } : undefined
        })
      }),
    []
  )

  // Check GitHub Releases once per launch and offer the update (nothing installs by itself).
  useEffect(() => {
    if (info?.devMode || !settings?.checkUpdatesOnStart) return
    const t = setTimeout(() => {
      api('app.checkUpdates')
        .then((u) => {
          if (u.available)
            toast({
              kind: 'info',
              title: `Autbot SEO Studio ${u.latest} is available`,
              body: u.installer
                ? 'It can install itself in a minute and keep all your data.'
                : 'Download it from the release page.',
              action: { label: 'See update', href: '#/settings/about' }
            })
        })
        .catch(() => undefined)
    }, 5000)
    return () => clearTimeout(t)
  }, [info?.devMode, settings?.checkUpdatesOnStart])

  return (
    <div className="flex h-full">
      <aside data-testid="sidebar" className="flex w-60 shrink-0 flex-col border-r bg-muted/30">
        <div className="border-b p-3">
          <div className="mb-2 flex items-center gap-2 px-1">
            <img
              src="./icon.png"
              alt=""
              className="h-6 w-6 rounded"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
            <span className="font-semibold">{info?.appName ?? 'Autbot SEO Studio'}</span>
          </div>
          <div className="flex gap-1">
            <Select
              aria-label="Website"
              value={site?.id ?? ''}
              onChange={(e) => {
                void setActiveSite(Number(e.target.value))
                nav('/')
              }}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <button
              title="Add a website"
              aria-label="Add a website"
              className="rounded-md border px-2 hover:bg-accent"
              onClick={() => nav('/settings/sites?add=1')}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:bg-accent'
                )
              }
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-1 border-t p-2">
          <button
            onClick={() => setBellOpen(true)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            <Bell className="h-4 w-4" /> Notifications
          </button>
          <button
            onClick={() => setActivityOpen(true)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
            data-testid="activity-button"
          >
            <Activity className={cn('h-4 w-4', active && 'text-primary')} />
            Activity
            {(active > 0 || waiting > 0) && (
              <span
                className={cn(
                  'ml-auto rounded-full px-2 text-xs text-primary-foreground',
                  waiting ? 'bg-warning' : 'bg-primary'
                )}
              >
                {active + waiting}
              </span>
            )}
          </button>
          {info?.devMode && <div className="px-3 text-xs text-warning">Developer mode</div>}
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <ActivityDrawer open={activityOpen} onOpenChange={setActivityOpen} jobs={jobs} />
      <NotificationsPanel open={bellOpen} onOpenChange={setBellOpen} />
    </div>
  )
}

/** Standard padded page wrapper. */
export function Page({
  children,
  className,
  wide
}: {
  children: React.ReactNode
  className?: string
  wide?: boolean
}) {
  return <div className={cn('mx-auto p-6', wide ? 'max-w-[1600px]' : 'max-w-6xl', className)}>{children}</div>
}

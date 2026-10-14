import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type RouteOutput } from './api'

export type Site = RouteOutput<'sites.list'>[number]
export type Settings = RouteOutput<'settings.get'>
export type AppInfo = RouteOutput<'app.info'>

interface Ctx {
  ready: boolean
  info: AppInfo | null
  sites: Site[]
  site: Site | null
  siteId: number | null
  settings: Settings | null
  reloadSites: () => Promise<void>
  setActiveSite: (id: number) => Promise<void>
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>
}

const AppCtx = createContext<Ctx | null>(null)

function applyTheme(theme: Settings['theme']) {
  const dark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [sites, setSites] = useState<Site[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [ready, setReady] = useState(false)

  const reloadSites = useCallback(async () => {
    const [s, st] = await Promise.all([api('sites.list'), api('settings.get')])
    setSites(s)
    setSettings(st)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        setInfo(await api('app.info'))
        await reloadSites()
      } finally {
        setReady(true)
      }
    })()
  }, [reloadSites])

  useEffect(() => {
    if (!settings) return
    applyTheme(settings.theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme(settings.theme)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [settings])

  const site = useMemo(
    () => sites.find((s) => s.id === settings?.activeSiteId) ?? sites[0] ?? null,
    [sites, settings?.activeSiteId]
  )

  const setActiveSite = useCallback(
    async (id: number) => {
      await api('sites.setActive', { siteId: id })
      await reloadSites()
    },
    [reloadSites]
  )

  const setSetting = useCallback(async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(await api('settings.set', { key, value }))
  }, [])

  return (
    <AppCtx.Provider
      value={{
        ready,
        info,
        sites,
        site,
        siteId: site?.id ?? null,
        settings,
        reloadSites,
        setActiveSite,
        setSetting
      }}
    >
      {children}
    </AppCtx.Provider>
  )
}

export function useApp(): Ctx {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp outside AppProvider')
  return c
}

/** The active site; screens that need a site render only when one exists. */
export function useSite(): Site {
  const { site } = useApp()
  if (!site) throw new Error('No active site')
  return site
}

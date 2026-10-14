import { Monitor, Moon, Sun } from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor }
] as const

export function AppearanceTab() {
  const { settings, setSetting } = useApp()
  const current = settings?.theme ?? 'system'
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Theme</h2>
      <div role="radiogroup" aria-label="Theme" className="grid max-w-xl grid-cols-3 gap-3">
        {THEMES.map((t) => (
          <button
            key={t.value}
            role="radio"
            aria-checked={current === t.value}
            onClick={() =>
              void setSetting('theme', t.value).catch(() =>
                toast({
                  kind: 'error',
                  title: "Couldn't change the theme",
                  body: 'Try again, or restart the app.'
                })
              )
            }
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-colors hover:bg-accent',
              current === t.value && 'border-primary bg-primary/5 text-primary'
            )}
          >
            <t.icon className="h-6 w-6" />
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        System follows your computer&apos;s light or dark setting.
      </p>
    </div>
  )
}

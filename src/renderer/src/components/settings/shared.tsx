import { useState } from 'react'
import { ExternalLink, Plus, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { Site } from '@/lib/app-context'
import { errorMessage } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GITHUB_REPO } from '@shared/constants'
import type { BusinessProfile, ExportFormat, ImageStyle, SiteSettings } from '@shared/types'

/** Site settings, including the keys the main process accepts that are not in the shared type yet. */
export type AllSiteSettings = SiteSettings & {
  weeklyRankCheck?: boolean
  socialCrop?: boolean
  imageFallback?: 'png' | 'jpg' | null
}

export function emptyProfile(): BusinessProfile {
  return {
    name: '',
    url: '',
    whatYouSell: '',
    serviceArea: '',
    customerType: '',
    topServices: ['', '', ''],
    competitors: [],
    tone: 'Friendly',
    language: 'English',
    country: 'US',
    mustNotSay: '',
    callToAction: '',
    facts: ''
  }
}

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/** The site's business profile with defaults filled in (mirrors profileOf in the main process). */
export function profileOf(site: Site): BusinessProfile {
  const p = site.businessProfile ?? {}
  return {
    name: str(p.name, site.name),
    url: str(p.url, site.url),
    whatYouSell: str(p.whatYouSell),
    serviceArea: str(p.serviceArea),
    customerType: str(p.customerType),
    topServices: strs(p.topServices),
    competitors: strs(p.competitors),
    tone: str(p.tone, 'Friendly'),
    language: str(p.language, site.language),
    country: str(p.country, site.country),
    mustNotSay: str(p.mustNotSay),
    callToAction: str(p.callToAction),
    facts: str(p.facts)
  }
}

export function settingsOf(site: Site): AllSiteSettings {
  return (site.settings ?? {}) as AllSiteSettings
}

export function imageStyleOf(site: Site): ImageStyle {
  const s = site.imageStyle ?? {}
  return {
    style: str(s.style, 'Photo-realistic'),
    avoid: str(s.avoid, "no text in images, no logos, no real people's faces"),
    brandColors: str(s.brandColors),
    labelAiImages: typeof s.labelAiImages === 'boolean' ? s.labelAiImages : true
  }
}

/** Open a web page in the user's browser (never inside the app). */
export function openLink(url: string): void {
  api('app.openExternal', { url }).catch((e: unknown) =>
    toast({ kind: 'error', title: errorMessage(e), body: `You can open it yourself: ${url}` })
  )
}

export const docLink = (file: string): string => `https://github.com/${GITHUB_REPO}/blob/main/docs/${file}`

export function ExternalButton({
  url,
  children,
  variant = 'link'
}: {
  url: string
  children: React.ReactNode
  variant?: 'link' | 'outline' | 'ghost'
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={variant === 'link' ? 'h-auto px-0' : undefined}
      onClick={() => openLink(url)}
    >
      {children}
      <ExternalLink />
    </Button>
  )
}

export const EXPORT_FORMAT_INFO: Record<ExportFormat, { label: string; desc: string }> = {
  generic: {
    label: 'Generic',
    desc: 'HTML, Markdown and plain text. Works with Wix, Squarespace, Shopify, Webflow or any site.'
  },
  hugo: { label: 'Hugo', desc: 'Markdown with Hugo front matter, ready for your content folder.' },
  jekyll: { label: 'Jekyll', desc: 'Markdown with Jekyll front matter for the _posts folder.' },
  astro: { label: 'Astro', desc: 'Markdown with front matter for an Astro content collection.' },
  eleventy: { label: 'Eleventy', desc: 'Markdown with Eleventy (11ty) front matter.' },
  'nextjs-mdx': { label: 'Next.js MDX', desc: 'An .mdx file with front matter for a Next.js site.' }
}

/** A list of short text inputs with add/remove buttons. */
export function ListInput({
  values,
  onChange,
  placeholder,
  min = 0,
  max = 10,
  addLabel = 'Add another'
}: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  min?: number
  max?: number
  addLabel?: string
}) {
  const rows = values.length < min ? [...values, ...Array<string>(min - values.length).fill('')] : values
  const set = (i: number, v: string) => onChange(rows.map((x, j) => (j === i ? v : x)))
  return (
    <div className="space-y-2">
      {rows.map((v, i) => (
        <div key={i} className="flex gap-2">
          <Input value={v} placeholder={placeholder} onChange={(e) => set(i, e.target.value)} />
          {rows.length > min && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          )}
        </div>
      ))}
      {rows.length < max && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, ''])}>
          <Plus /> {addLabel}
        </Button>
      )}
    </div>
  )
}

/** A row with a label, an explanation and a switch on the right. */
export function SwitchRow({
  label,
  hint,
  children
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="pt-0.5">{children}</div>
    </div>
  )
}

/** Small hook for a "save" button state with an inline error. */
export function useSaveState() {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async (fn: () => Promise<unknown>, success?: string): Promise<boolean> => {
    setSaving(true)
    setError(null)
    try {
      await fn()
      if (success) toast({ kind: 'success', title: success })
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    } finally {
      setSaving(false)
    }
  }
  return { saving, error, setError, save }
}

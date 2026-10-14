import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Globe, Plus, RefreshCw, Save, Trash2, Wand2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { useApp, type Site } from '@/lib/app-context'
import { errorMessage } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Callout, EmptyState, ErrorText, Loading } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import {
  CONTENT_TYPES,
  IMAGE_STYLES,
  LENGTHS,
  type BusinessProfile,
  type ContentType,
  type ExportFormat,
  type ImageStyle,
  type LengthKey
} from '@shared/types'
import { BusinessProfileForm, cleanProfile, profileProblem } from './BusinessProfileForm'
import { ExportFormatPicker, isExportFormat } from './ExportFormatPicker'
import {
  SwitchRow,
  emptyProfile,
  imageStyleOf,
  profileOf,
  settingsOf,
  useSaveState,
  type AllSiteSettings
} from './shared'

function SaveButton({
  saving,
  onClick,
  children = 'Save'
}: {
  saving: boolean
  onClick: () => void
  children?: React.ReactNode
}) {
  return (
    <Button onClick={onClick} loading={saving}>
      {!saving && <Save />} {children}
    </Button>
  )
}

/* ------------------------------------------------------------------ add a site */

function AddSiteForm({ onDone }: { onDone: () => void }) {
  const { reloadSites } = useApp()
  const [p, setP] = useState<BusinessProfile>(emptyProfile())
  const { saving, error, setError, save } = useSaveState()
  const submit = async () => {
    const problem = profileProblem(p)
    if (problem) return setError(problem)
    const ok = await save(async () => {
      await api('sites.create', cleanProfile(p))
      await reloadSites()
    }, 'Website added. Reading its pages in the background.')
    if (ok) onDone()
  }
  return (
    <Card data-testid="add-site-form">
      <CardHeader>
        <CardTitle>Add a website</CardTitle>
        <CardDescription>
          Each website has its own business profile, content, keywords and settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <BusinessProfileForm value={p} onChange={setP} />
        <ErrorText error={error} />
      </CardContent>
      <CardFooter>
        <SaveButton saving={saving} onClick={() => void submit()}>
          Add website
        </SaveButton>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </CardFooter>
    </Card>
  )
}

/* ------------------------------------------------------------------ editor sections */

function ProfileSection({ site }: { site: Site }) {
  const { reloadSites } = useApp()
  const [p, setP] = useState<BusinessProfile>(() => profileOf(site))
  const [notes, setNotes] = useState(site.strategyNotes ?? '')
  const { saving, error, setError, save } = useSaveState()
  const submit = async () => {
    const problem = profileProblem(p)
    if (problem) return setError(problem)
    await save(async () => {
      await api('sites.update', { siteId: site.id, profile: cleanProfile(p), strategyNotes: notes })
      await reloadSites()
    }, 'Business profile saved')
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Business profile</CardTitle>
        <CardDescription>
          The AI reads this before every task. The more specific, the better the content.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <BusinessProfileForm value={p} onChange={setP} showExtras />
        <Field
          label="Strategy notes"
          hint="Anything else the AI should keep in mind: seasonal focus, offers, what to avoid writing about."
        >
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
        </Field>
        <ErrorText error={error} />
      </CardContent>
      <CardFooter>
        <SaveButton saving={saving} onClick={() => void submit()} />
      </CardFooter>
    </Card>
  )
}

function VoiceSection({ site }: { site: Site }) {
  const { reloadSites } = useApp()
  const pages = useApi('sites.pages', { siteId: site.id })
  const [samples, setSamples] = useState<string[]>(site.voiceSamples ?? [])
  const [paste, setPaste] = useState('')
  const { saving, error, save } = useSaveState()
  const textOf = (para: string[]) => para.join('\n\n').trim()
  const usable = (pages.data ?? []).filter((pg) => textOf(pg.paragraphs).length > 200)
  const fromPages = new Set(usable.map((pg) => textOf(pg.paragraphs)))
  const pasted = samples.filter((s) => !fromPages.has(s))

  const toggle = (text: string, on: boolean) => {
    if (on && samples.length >= 3)
      return toast({ kind: 'info', title: 'Pick up to 3 samples', body: 'Untick one first.' })
    setSamples(on ? [...samples, text] : samples.filter((s) => s !== text))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice samples</CardTitle>
        <CardDescription>
          Pick up to 3 of your own pages that sound most like you. The AI copies their style (not their
          words).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pages.loading && !pages.data ? (
          <Loading label="Loading your pages…" />
        ) : pages.error ? (
          <ErrorText error={pages.error} />
        ) : usable.length === 0 ? (
          <Callout>
            No pages with enough text yet. Click &ldquo;Re-crawl site&rdquo; above and come back in a minute,
            or paste a sample below.
          </Callout>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
            {usable.map((pg) => {
              const t = textOf(pg.paragraphs)
              return (
                <label
                  key={pg.id}
                  className="flex cursor-pointer items-start gap-2 rounded p-1.5 text-sm hover:bg-accent/50"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={samples.includes(t)}
                    onChange={(e) => toggle(t, e.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{pg.title || pg.url}</span>
                    <span className="block truncate text-xs text-muted-foreground">{pg.url}</span>
                  </span>
                </label>
              )
            })}
          </div>
        )}
        {pasted.map((s, i) => (
          <div key={i} className="flex items-start gap-2 rounded-md border p-2 text-sm">
            <span className="line-clamp-2 flex-1 text-muted-foreground">{s}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove sample"
              onClick={() => setSamples(samples.filter((x) => x !== s))}
            >
              <X />
            </Button>
          </div>
        ))}
        {samples.length < 3 && (
          <Field label="Or paste a sample of your writing">
            <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} />
            {paste.trim() && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  toggle(paste.trim(), true)
                  setPaste('')
                }}
              >
                <Plus /> Add sample
              </Button>
            )}
          </Field>
        )}
        <p className="text-xs text-muted-foreground">{samples.length} of 3 picked.</p>
        <ErrorText error={error} />
      </CardContent>
      <CardFooter>
        <SaveButton
          saving={saving}
          onClick={() =>
            void save(async () => {
              await api('sites.update', { siteId: site.id, voiceSamples: samples.slice(0, 3) })
              await reloadSites()
            }, 'Voice samples saved')
          }
        />
      </CardFooter>
    </Card>
  )
}

function ImageStyleSection({ site }: { site: Site }) {
  const { reloadSites } = useApp()
  const [s, setS] = useState<ImageStyle>(() => imageStyleOf(site))
  const [st, setSt] = useState<AllSiteSettings>(() => settingsOf(site))
  const { saving, error, save } = useSaveState()
  const preset = (IMAGE_STYLES as readonly string[]).includes(s.style)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Image style</CardTitle>
        <CardDescription>How AI-made images should look on this site.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Style">
            <Select
              value={preset ? s.style : '__custom'}
              onChange={(e) => setS({ ...s, style: e.target.value === '__custom' ? '' : e.target.value })}
            >
              {IMAGE_STYLES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
              <option value="__custom">Custom…</option>
            </Select>
            {!preset && (
              <Input
                className="mt-2"
                value={s.style}
                onChange={(e) => setS({ ...s, style: e.target.value })}
                placeholder="Describe the style"
              />
            )}
          </Field>
          <Field label="Brand colors" hint="Names or hex codes, e.g. navy #1B2A4A and orange.">
            <Input
              value={s.brandColors ?? ''}
              onChange={(e) => setS({ ...s, brandColors: e.target.value })}
            />
          </Field>
          <Field label="Things to avoid in images" className="md:col-span-2">
            <Input value={s.avoid} onChange={(e) => setS({ ...s, avoid: e.target.value })} />
          </Field>
        </div>
        <SwitchRow
          label="Label AI-generated images"
          hint='Adds "AI-generated image" to the caption so readers know.'
        >
          <Switch checked={s.labelAiImages} onCheckedChange={(v) => setS({ ...s, labelAiImages: v })} />
        </SwitchRow>
        <SwitchRow
          label="Crop the featured image for social media"
          hint="1200 × 630, the size Facebook, LinkedIn and X show best."
        >
          <Switch checked={Boolean(st.socialCrop)} onCheckedChange={(v) => setSt({ ...st, socialCrop: v })} />
        </SwitchRow>
        <Field
          label="Also save images as"
          hint="WebP is used by default. Add a fallback if your site builder can't take WebP."
        >
          <Select
            className="max-w-xs"
            value={st.imageFallback ?? ''}
            onChange={(e) =>
              setSt({
                ...st,
                imageFallback: e.target.value === 'png' || e.target.value === 'jpg' ? e.target.value : null
              })
            }
          >
            <option value="">WebP only</option>
            <option value="jpg">WebP + JPG</option>
            <option value="png">WebP + PNG</option>
          </Select>
        </Field>
        <ErrorText error={error} />
      </CardContent>
      <CardFooter>
        <SaveButton
          saving={saving}
          onClick={() =>
            void save(async () => {
              await api('sites.update', {
                siteId: site.id,
                imageStyle: {
                  style: s.style.trim() || 'Photo-realistic',
                  avoid: s.avoid,
                  brandColors: s.brandColors,
                  labelAiImages: s.labelAiImages
                },
                settings: { socialCrop: Boolean(st.socialCrop), imageFallback: st.imageFallback ?? null }
              })
              await reloadSites()
            }, 'Image style saved')
          }
        />
      </CardFooter>
    </Card>
  )
}

function DefaultsSection({ site }: { site: Site }) {
  const { reloadSites } = useApp()
  const init = settingsOf(site)
  const [type, setType] = useState<ContentType>(init.defaultContentType ?? 'blog post')
  const [length, setLength] = useState<LengthKey>(init.defaultLength ?? 'standard')
  const [format, setFormat] = useState<ExportFormat>(
    isExportFormat(site.exportFormat) ? site.exportFormat : 'generic'
  )
  const [budget, setBudget] = useState(init.monthlyBudgetUsd != null ? String(init.monthlyBudgetUsd) : '')
  const [rankLocation, setRankLocation] = useState(init.rankLocation ?? '')
  const [rankDevice, setRankDevice] = useState<'desktop' | 'mobile'>(init.rankDevice ?? 'desktop')
  const [weekly, setWeekly] = useState(Boolean(init.weeklyRankCheck))
  const { saving, error, setError, save } = useSaveState()

  const submit = async () => {
    let cap: number | null = null
    if (budget.trim()) {
      cap = Number(budget.replace(/[$,\s]/g, ''))
      if (!Number.isFinite(cap) || cap < 0)
        return setError('Type the budget as a number of dollars, like 20. Leave it blank for no limit.')
    }
    await save(async () => {
      await api('sites.update', {
        siteId: site.id,
        exportFormat: format,
        settings: {
          defaultContentType: type,
          defaultLength: length,
          monthlyBudgetUsd: cap,
          rankLocation: rankLocation.trim(),
          rankDevice,
          weeklyRankCheck: weekly
        }
      })
      await reloadSites()
    }, 'Defaults saved')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Defaults and budget</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Default content type">
            <Select value={type} onChange={(e) => setType(e.target.value as ContentType)}>
              {CONTENT_TYPES.filter((t) => t !== 'refresh').map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Default length">
            <Select value={length} onChange={(e) => setLength(e.target.value as LengthKey)}>
              {(Object.keys(LENGTHS) as LengthKey[]).map((k) => (
                <option key={k} value={k}>
                  {LENGTHS[k].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Monthly AI budget (USD)"
            hint="The app pauses and asks before going over. Blank = no limit."
          >
            <Input
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="No limit"
            />
          </Field>
        </div>
        <Field label="Export format" hint="Used when you export files instead of sending to WordPress.">
          <ExportFormatPicker value={format} onChange={setFormat} />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Rank tracking location"
            hint='A city or country, e.g. "Austin, Texas, United States". Blank = the whole country.'
          >
            <Input value={rankLocation} onChange={(e) => setRankLocation(e.target.value)} />
          </Field>
          <Field label="Rank tracking device">
            <Select
              value={rankDevice}
              onChange={(e) => setRankDevice(e.target.value === 'mobile' ? 'mobile' : 'desktop')}
            >
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
            </Select>
          </Field>
        </div>
        <SwitchRow
          label="Check rankings every week"
          hint="Uses DataForSEO (Settings > Data Sources). Costs a few cents per keyword."
        >
          <Switch checked={weekly} onCheckedChange={setWeekly} />
        </SwitchRow>
        <ErrorText error={error} />
      </CardContent>
      <CardFooter>
        <SaveButton saving={saving} onClick={() => void submit()} />
      </CardFooter>
    </Card>
  )
}

/* ------------------------------------------------------------------ the tab */

export function SitesTab() {
  const { sites, site: active, reloadSites, setActiveSite } = useApp()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const [adding, setAdding] = useState(params.get('add') === '1')
  const [editId, setEditId] = useState<number | null>(active?.id ?? null)
  const [busy, setBusy] = useState<string | null>(null)
  const [ask, confirmDialog] = useConfirm()

  useEffect(() => {
    if (params.get('add') === '1') setAdding(true)
  }, [params])

  const editing = sites.find((s) => s.id === editId) ?? active ?? sites[0] ?? null

  const closeAdd = () => {
    setAdding(false)
    if (params.has('add')) {
      params.delete('add')
      setParams(params, { replace: true })
    }
  }

  const remove = async (s: Site) => {
    const ok = await ask({
      title: `Delete ${s.name}?`,
      body: 'This removes the website and all of its content, keywords, images and history from this app. Nothing is deleted from your real website or WordPress. This cannot be undone (unless you have a backup).',
      confirm: 'Delete website',
      danger: true
    })
    if (!ok) return
    setBusy(`del-${s.id}`)
    try {
      await api('sites.delete', { siteId: s.id })
      const rest = sites.filter((x) => x.id !== s.id)
      if (active?.id === s.id && rest[0]) await api('sites.setActive', { siteId: rest[0].id })
      await reloadSites()
      setEditId(null)
      toast({ kind: 'success', title: `${s.name} deleted` })
      if (rest.length === 0) nav('/setup')
    } catch (e) {
      toast({
        kind: 'error',
        title: errorMessage(e),
        body: 'Try again. If it keeps failing, restart the app.'
      })
    } finally {
      setBusy(null)
    }
  }

  const recrawl = async (s: Site) => {
    setBusy(`crawl-${s.id}`)
    try {
      await api('sites.crawl', { siteId: s.id })
      toast({ kind: 'info', title: `Reading ${s.name} again`, body: 'Watch progress in Activity.' })
    } catch (e) {
      toast({
        kind: 'error',
        title: errorMessage(e),
        body: 'Check the website address in the business profile, then try again.'
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Your websites. Pick one to edit its profile and settings.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => nav('/setup')}>
            <Wand2 /> Run setup again
          </Button>
          {!adding && (
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add a website
            </Button>
          )}
        </div>
      </div>

      {adding && <AddSiteForm onDone={closeAdd} />}

      {sites.length === 0 ? (
        <EmptyState
          icon={<Globe className="h-8 w-8" />}
          title="No websites yet"
          action={<Button onClick={() => setAdding(true)}>Add a website</Button>}
        >
          Add your website to get started.
        </EmptyState>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((s) => (
            <div
              key={s.id}
              className={`flex items-center gap-3 rounded-lg border p-3 ${editing?.id === s.id ? 'border-primary bg-primary/5' : ''}`}
            >
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditId(s.id)}>
                <div className="flex items-center gap-2 font-medium">
                  <span className="truncate">{s.name}</span>
                  {active?.id === s.id && <Badge>Active</Badge>}
                  {s.wpConnected && <Badge variant="outline">WordPress</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{s.url}</div>
              </button>
              {active?.id !== s.id && (
                <Button size="sm" variant="ghost" onClick={() => void setActiveSite(s.id)}>
                  Make active
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Delete ${s.name}`}
                loading={busy === `del-${s.id}`}
                onClick={() => void remove(s)}
              >
                {busy !== `del-${s.id}` && <Trash2 />}
              </Button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="space-y-4" key={editing.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{editing.name}</h2>
            <Button
              variant="outline"
              onClick={() => void recrawl(editing)}
              loading={busy === `crawl-${editing.id}`}
            >
              {busy !== `crawl-${editing.id}` && <RefreshCw />} Re-crawl site
            </Button>
          </div>
          <ProfileSection site={editing} />
          <VoiceSection site={editing} />
          <DefaultsSection site={editing} />
          <ImageStyleSection site={editing} />
        </div>
      )}
      {confirmDialog}
    </div>
  )
}

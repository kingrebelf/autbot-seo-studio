import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, FileDown, Globe, PartyPopper, Sparkles, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/app-context'
import { cn, errorMessage } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Callout, ErrorText } from '@/components/ui/misc'
import { APP_NAME } from '@shared/constants'
import type { BusinessProfile, ExportFormat } from '@shared/types'
import { BusinessProfileForm, cleanProfile, profileProblem } from '@/components/settings/BusinessProfileForm'
import { ProviderCards, useConnectedCount } from '@/components/settings/ProviderCards'
import { TaskTable } from '@/components/settings/TaskTable'
import { WordPressConnect } from '@/components/settings/WordPressConnect'
import { ExportFormatPicker, isExportFormat } from '@/components/settings/ExportFormatPicker'
import { GoogleConnect } from '@/components/settings/GoogleConnect'
import { SubscriptionsTable } from '@/components/settings/SubscriptionsTable'
import { emptyProfile, profileOf } from '@/components/settings/shared'

const STEPS = [
  'Your business',
  'Connect an AI',
  'Pick your models',
  'Where content goes',
  'Google Search Console'
] as const

function Progress({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Setup progress">
      {STEPS.map((label, i) => {
        const done = i < step
        const active = i === step
        return (
          <li key={label} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                done && 'border-primary bg-primary text-primary-foreground',
                active && 'border-primary text-primary',
                !done && !active && 'text-muted-foreground'
              )}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className={cn('hidden text-sm lg:inline', active ? 'font-medium' : 'text-muted-foreground')}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
          </li>
        )
      })}
    </ol>
  )
}

export default function SetupWizard() {
  const { site, sites, settings, reloadSites } = useApp()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [siteId, setSiteId] = useState<number | null>(site?.id ?? null)
  const [profile, setProfile] = useState<BusinessProfile>(() => (site ? profileOf(site) : emptyProfile()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dest, setDest] = useState<'wordpress' | 'export'>('wordpress')
  const [format, setFormat] = useState<ExportFormat>(
    site && isExportFormat(site.exportFormat) ? site.exportFormat : 'generic'
  )
  const [aiKey, setAiKey] = useState(0)
  const ai = useConnectedCount()
  const canLeave = Boolean(settings?.firstRunDone && sites.length > 0)

  useEffect(() => {
    setError(null)
    document.getElementById('setup-scroll')?.scrollTo({ top: 0 })
  }, [step])

  useEffect(() => {
    void ai.reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiKey, step])

  const saveBusiness = async () => {
    const problem = profileProblem(profile)
    if (problem) return setError(problem)
    setSaving(true)
    setError(null)
    try {
      const clean = cleanProfile(profile)
      // An earlier, unfinished setup run may already have made the site: update it instead of adding a duplicate.
      const existing = siteId !== null && sites.some((s) => s.id === siteId) ? siteId : null
      if (existing !== null) {
        await api('sites.update', { siteId: existing, profile: clean })
      } else {
        const s = await api('sites.create', clean)
        setSiteId(s.id)
      }
      await reloadSites()
      setStep(1)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const saveDestination = async () => {
    if (dest === 'export' && siteId !== null) {
      setSaving(true)
      setError(null)
      try {
        await api('sites.update', { siteId, exportFormat: format })
        await reloadSites()
      } catch (e) {
        setError(errorMessage(e))
        setSaving(false)
        return
      }
      setSaving(false)
    }
    setStep(4)
  }

  const finish = async (startModeB: boolean) => {
    setSaving(true)
    setError(null)
    try {
      if (startModeB && siteId !== null) await api('modes.start', { siteId, mode: 'B' })
      await api('firstRun.complete')
      await reloadSites()
      nav('/')
    } catch (e) {
      setError(`${errorMessage(e)} You can click "Not now" and start it later from New Content.`)
    } finally {
      setSaving(false)
    }
  }

  const next = () => {
    if (step === 0) return void saveBusiness()
    if (step === 3) return void saveDestination()
    setStep(step + 1)
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <img
            src="./icon.png"
            alt=""
            className="h-6 w-6 rounded"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
          {APP_NAME} setup
        </div>
        {step < STEPS.length && <Progress step={step} />}
        {canLeave ? (
          <Button variant="ghost" size="sm" onClick={() => nav('/settings/about')}>
            <X /> Exit setup
          </Button>
        ) : (
          <span />
        )}
      </header>

      <div id="setup-scroll" className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-6 pb-28">
          {step === 0 && (
            <section className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold">Your business</h1>
                <p className="mt-1 text-muted-foreground">
                  Tell the app about your business. Everything it writes starts from this, so a few honest
                  sentences go a long way. You can change it any time in Settings.
                </p>
              </div>
              <BusinessProfileForm value={profile} onChange={setProfile} />
            </section>
          )}

          {step === 1 && (
            <section className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold">Connect an AI</h1>
                <p className="mt-1 text-muted-foreground">
                  Connect at least one. If you have ChatGPT Plus or Pro, signing in is the easiest start. For
                  the best writing, add an Anthropic or OpenAI API key. Local models are free but slower.
                </p>
              </div>
              {ai.count > 0 ? (
                <Callout kind="success">
                  {ai.count} AI provider{ai.count === 1 ? '' : 's'} connected. You can add more, or continue.
                </Callout>
              ) : null}
              <ProviderCards onChange={() => setAiKey((n) => n + 1)} />
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Can I use my chat subscription?
                </summary>
                <div className="mt-3">
                  <SubscriptionsTable />
                </div>
              </details>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold">Pick your models</h1>
                <p className="mt-1 text-muted-foreground">
                  We picked a recommended model for each job. Change any of them, or just continue.
                </p>
              </div>
              {ai.count === 0 && (
                <Callout kind="warning">
                  No AI is connected yet, so there is nothing to pick. Go back one step to connect one, or
                  skip and do it later in Settings &gt; AI Models.
                </Callout>
              )}
              <TaskTable autofillFirst refreshKey={aiKey} />
            </section>
          )}

          {step === 3 && siteId !== null && (
            <section className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold">Where content goes</h1>
                <p className="mt-1 text-muted-foreground">
                  Send finished pieces to WordPress as drafts, or export files you paste into any website
                  builder.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(
                  [
                    {
                      v: 'wordpress',
                      icon: Globe,
                      title: 'WordPress',
                      desc: 'Connect now. The app creates drafts; you publish.'
                    },
                    {
                      v: 'export',
                      icon: FileDown,
                      title: 'Export files',
                      desc: 'Wix, Squarespace, Shopify, Webflow, Hugo and more.'
                    }
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    onClick={() => setDest(o.v)}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent/50',
                      dest === o.v && 'border-primary bg-primary/5'
                    )}
                    aria-pressed={dest === o.v}
                  >
                    <o.icon className="mt-0.5 h-5 w-5 text-primary" />
                    <span>
                      <span className="font-medium">{o.title}</span>
                      <span className="block text-sm text-muted-foreground">{o.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
              {dest === 'wordpress' ? (
                <WordPressConnect siteId={siteId} />
              ) : (
                <ExportFormatPicker value={format} onChange={setFormat} />
              )}
            </section>
          )}

          {step === 4 && (
            <section className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold">Google Search Console</h1>
                <p className="mt-1 text-muted-foreground">
                  Optional, but strongly recommended. Search Console shows the searches you already appear
                  for, so the app can find quick wins with real numbers instead of guesses. It&apos;s free,
                  and the guide takes about five minutes.
                </p>
              </div>
              <GoogleConnect siteId={siteId} />
            </section>
          )}

          {step === 5 && (
            <section className="flex flex-col items-center gap-4 py-12 text-center">
              <PartyPopper className="h-12 w-12 text-primary" />
              <h1 className="text-2xl font-semibold">
                You&apos;re set. Want me to look at your website and suggest your first three pieces of
                content?
              </h1>
              <p className="max-w-lg text-muted-foreground">
                The app reads your site and your business profile, then suggests three pieces most likely to
                bring in customers. It runs in the background; you can watch it in Activity.
              </p>
              {ai.count === 0 && (
                <Callout kind="warning" className="max-w-lg text-left">
                  This needs a connected AI. Click &ldquo;Not now&rdquo;, then connect one in Settings &gt; AI
                  Models.
                </Callout>
              )}
              <ErrorText error={error} />
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  size="lg"
                  onClick={() => void finish(true)}
                  loading={saving}
                  disabled={ai.count === 0 || siteId === null}
                >
                  {!saving && <Sparkles />} Yes, suggest three pieces
                </Button>
                <Button size="lg" variant="outline" onClick={() => void finish(false)} disabled={saving}>
                  Not now
                </Button>
              </div>
            </section>
          )}

          {step < 5 && <ErrorText error={error} />}
        </div>
      </div>

      {step < 5 && (
        <footer className="flex items-center justify-between gap-2 border-t bg-background px-6 py-3">
          <div>
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={saving}>
                <ArrowLeft /> Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-2 text-sm text-muted-foreground">
              Step {step + 1} of {STEPS.length}
            </span>
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(step + 1)} disabled={saving}>
                Skip
              </Button>
            )}
            <Button onClick={next} loading={saving}>
              {step === STEPS.length - 1 ? 'Finish' : 'Continue'} {!saving && <ArrowRight />}
            </Button>
          </div>
        </footer>
      )}
    </div>
  )
}

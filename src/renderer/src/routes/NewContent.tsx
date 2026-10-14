import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { api } from '@/lib/api'
import { useApi, useAction } from '@/hooks/useApi'
import { useJobs } from '@/hooks/useJobs'
import { useSite } from '@/lib/app-context'
import type { Mode } from '@shared/types'
import { Page } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader, Loading, ErrorText, Callout, Spinner } from '@/components/ui/misc'
import { ModePicker, MODES } from '@/components/wizard/ModePicker'
import { ModeForm } from '@/components/wizard/ModeForms'
import { ChooseStep } from '@/components/wizard/ChooseStep'
import { BriefStep } from '@/components/wizard/BriefStep'
import { cn } from '@/lib/utils'

const STEPS = ['Topic', 'Research', 'Choose', 'Brief', 'Write']

function Stepper({ current }: { current: number }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border text-xs',
              i < current && 'border-primary bg-primary text-primary-foreground',
              i === current && 'border-primary text-primary'
            )}
          >
            {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span className={cn(i === current ? 'font-medium' : 'text-muted-foreground')}>{s}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
        </li>
      ))}
    </ol>
  )
}

export default function NewContent() {
  const { contentId } = useParams()
  return contentId ? <PieceWizard id={Number(contentId)} /> : <Start />
}

function Start() {
  const site = useSite()
  const [params, setParams] = useSearchParams()
  const mode = (params.get('mode') as Mode | null) ?? null
  const prefill = {
    topic: params.get('topic') ?? undefined,
    notes: params.get('notes') ?? undefined,
    type: params.get('type') ?? undefined,
    url: params.get('url') ?? undefined,
    calendarItemId: params.get('calendarItemId') ? Number(params.get('calendarItemId')) : undefined
  }
  const info = MODES.find((m) => m.mode === mode)
  return (
    <Page>
      <PageHeader
        title="New content"
        description="Pick how you want to start. Every mode asks if there's anything else it should know."
      />
      <ModePicker value={mode} onPick={(m) => setParams({ mode: m })} />
      {mode && info && (
        <Card className="mt-6">
          <CardContent className="pt-4">
            <h2 className="mb-4 text-lg font-semibold">{info.title}</h2>
            <ModeForm key={`${mode}-${params.toString()}`} mode={mode} siteId={site.id} prefill={prefill} />
          </CardContent>
        </Card>
      )}
    </Page>
  )
}

function PieceWizard({ id }: { id: number }) {
  const nav = useNavigate()
  const { data: c, error, reload } = useApi('content.get', { id }, { refreshOnJobs: true })
  const jobs = useJobs(c?.siteId ?? null)
  const { busy, run } = useAction()
  const [chosen, setChosen] = useState(false)
  useEffect(() => setChosen(false), [c?.brief])

  if (error)
    return (
      <Page>
        <ErrorText error={error} />
      </Page>
    )
  if (!c) return <Loading />
  const job = c.activeJob
  const working = job && (job.status === 'running' || job.status === 'queued')
  const lastFailed = jobs.find(
    (j) => j.contentId === id && (j.status === 'failed' || j.status === 'cancelled')
  )
  const budget = job?.status === 'waiting_for_user' && job.step === 'budget'

  // Once writing has started, the editor takes over.
  if (
    c.mode === 'D' ||
    ['Writing', 'Checking', 'Ready for review', 'Draft sent', 'Published', 'Needs refresh'].includes(c.status)
  )
    return <Navigate to={`/content/${id}`} replace />

  let step = 1
  let body: React.ReactNode = null
  if (budget) {
    body = (
      <Callout kind="warning" title="Paused: monthly AI budget reached">
        {job?.error ?? 'This site reached its monthly AI budget cap.'} You can raise the cap in Settings &gt;
        Sites, or continue just this once.
        <div className="mt-2">
          <Button
            size="sm"
            loading={busy === 'go'}
            onClick={() => run('go', () => api('jobs.continue', { id: job!.id, budgetOverride: true }))}
          >
            Continue anyway
          </Button>
        </div>
      </Callout>
    )
  } else if (working) {
    step = job!.type === 'brief' ? 3 : 1
    body = (
      <Card>
        <CardContent className="flex items-center gap-3 py-10">
          <Spinner className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="font-medium">
              {job!.type === 'brief' ? 'Writing the content brief' : 'Researching'}
            </div>
            <div className="text-sm text-muted-foreground">
              {job!.progress ?? 'Waiting to start…'} You can leave this screen; it keeps going in the
              background.
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => run('cancel', () => api('jobs.cancel', { id: job!.id }))}
          >
            Cancel
          </Button>
        </CardContent>
      </Card>
    )
  } else if (c.brief && !chosen) {
    step = 3
    body = <BriefStep content={c} />
  } else if (c.research && !chosen) {
    step = 2
    body = (
      <ChooseStep
        content={c}
        onDone={() => {
          setChosen(true)
          void reload()
        }}
      />
    )
  } else if (chosen) {
    step = 3
    body = (
      <Card>
        <CardContent className="flex items-center gap-3 py-10">
          <Spinner className="h-5 w-5 text-primary" /> Writing the content brief…
        </CardContent>
      </Card>
    )
  } else {
    body = (
      <Callout kind="error" title="The research didn't finish">
        {lastFailed?.error ?? 'It was stopped before it finished.'}
        <div className="mt-2">
          <Button
            size="sm"
            loading={busy === 'rerun'}
            onClick={() => run('rerun', () => api('content.rerunResearch', { id }))}
          >
            Try the research again
          </Button>
        </div>
      </Callout>
    )
  }

  return (
    <Page wide>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => nav('/content')}>
        <ArrowLeft /> Content
      </Button>
      <PageHeader
        title={c.title || c.topic || 'New piece'}
        description={c.focusKeyword ? `Focus keyword: ${c.focusKeyword}` : `Topic: ${c.topic ?? ''}`}
      />
      <Stepper current={step} />
      {body}
    </Page>
  )
}

import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wrench,
  RefreshCw,
  Gauge,
  Check,
  X,
  Lightbulb
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAction } from '@/hooks/useApi'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScoreRing } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { cn, timeAgo } from '@/lib/utils'
import { useEditorCtx } from '../context'
import type { CheckState } from '../types'
import { Section } from './Section'

export function StateIcon({ state, className }: { state: CheckState; className?: string }) {
  if (state === 'pass')
    return <CheckCircle2 className={cn('h-4 w-4 shrink-0 text-success', className)} aria-label="Pass" />
  if (state === 'warn')
    return <AlertTriangle className={cn('h-4 w-4 shrink-0 text-warning', className)} aria-label="Warning" />
  return <XCircle className={cn('h-4 w-4 shrink-0 text-destructive', className)} aria-label="Needs work" />
}

const ORDER: Record<CheckState, number> = { fail: 0, warn: 1, pass: 2 }

export function SeoPanel() {
  const { content, checks, applyContent, flushSave, reload } = useEditorCtx()
  const { busy, run } = useAction()
  const jobActive = Boolean(content.activeJob)
  const sorted = [...checks.seo].sort((a, b) => ORDER[a.state] - ORDER[b.state])
  const counts = { pass: 0, warn: 0, fail: 0 }
  for (const c of checks.seo) counts[c.state]++
  const sp = checks.seoPass

  const fix = (checkId: string) =>
    run(`fix:${checkId}`, async () => {
      await flushSave()
      applyContent(await api('content.fixCheck', { id: content.id, checkId }), { syncBody: true })
      toast({
        kind: 'success',
        title: 'Fixed',
        body: 'Check the change in the editor. You can undo it from the History tab.'
      })
    })

  const decide = (index: number, accept: boolean) =>
    run(`sug:${index}`, async () => {
      await flushSave()
      await api('content.applySuggestion', { id: content.id, index, accept })
      await reload()
    })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <ScoreRing score={content.seoScore} size={72} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">SEO score</div>
          <div className="text-sm text-muted-foreground">
            {counts.fail} to fix · {counts.warn} to look at · {counts.pass} passing
          </div>
          {checks.checkedAt && (
            <div className="text-xs text-muted-foreground">Full checks ran {timeAgo(checks.checkedAt)}</div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          loading={busy === 'score'}
          onClick={() =>
            void run('score', async () => {
              await flushSave()
              await api('content.score', { id: content.id })
              await reload()
            })
          }
        >
          <Gauge /> Score now
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={jobActive}
          loading={busy === 'checks'}
          onClick={() =>
            void run('checks', async () => {
              await flushSave()
              await api('content.runChecks', { id: content.id })
              toast({
                kind: 'info',
                title: 'Running the full checks',
                body: 'SEO pass, fact-check and link check. This takes a minute or two.'
              })
              await reload()
            })
          }
        >
          <RefreshCw /> Re-run checks
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No score yet. Click "Score now".</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {sorted.map((c) => (
            <li key={c.id} className="flex items-start gap-2 p-2.5">
              <StateIcon state={c.state} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{c.label}</div>
                {c.detail && <div className="text-xs text-muted-foreground">{c.detail}</div>}
              </div>
              {c.state !== 'pass' && c.fixable && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2"
                  disabled={jobActive || (busy !== null && busy !== `fix:${c.id}`)}
                  loading={busy === `fix:${c.id}`}
                  onClick={() => void fix(c.id)}
                >
                  <Wrench /> Fix it
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {sp && sp.suggestions.length > 0 && (
        <Section
          title="AI suggestions"
          hint="Proposed edits from the AI SEO pass. Nothing changes until you accept."
        >
          <ul className="space-y-2">
            {sp.suggestions.map((s, i) => {
              const decided = sp.decided[String(i)]
              return (
                <li key={i} className={cn('rounded-md border p-2.5 text-sm', decided && 'opacity-60')}>
                  <div className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive line-through decoration-destructive/60">
                    {s.find}
                  </div>
                  <div className="mt-1 rounded bg-success/10 px-1.5 py-0.5 text-success">{s.replace}</div>
                  {s.reason && <div className="mt-1.5 text-xs text-muted-foreground">{s.reason}</div>}
                  <div className="mt-2 flex items-center gap-2">
                    {decided ? (
                      <Badge variant={decided === 'accepted' ? 'success' : 'secondary'}>
                        {decided === 'accepted' ? 'Accepted' : 'Rejected'}
                      </Badge>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          className="h-7 px-2"
                          loading={busy === `sug:${i}`}
                          disabled={busy !== null}
                          onClick={() => void decide(i, true)}
                        >
                          <Check /> Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          disabled={busy !== null}
                          onClick={() => void decide(i, false)}
                        >
                          <X /> Reject
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      {sp && sp.backlink_ideas.length > 0 && (
        <Section title="Backlink ideas" hint="Advice only. The app never contacts anyone for you.">
          <ul className="space-y-2">
            {sp.backlink_ideas.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div>
                  <div>{b.idea}</div>
                  {b.why && <div className="text-xs text-muted-foreground">{b.why}</div>}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

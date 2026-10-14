import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, ExternalLink, RotateCcw, Star } from 'lucide-react'
import { api, type RouteOutput } from '@/lib/api'
import { useAction } from '@/hooks/useApi'
import { CONTENT_TYPES, type LengthKey } from '@shared/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Callout, ErrorText } from '@/components/ui/misc'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { LengthPicker } from './ModeForms'
import type { ResearchData } from './types'
import { ModelOverrides, type Overrides } from './ModelOverrides'

type Content = RouteOutput<'content.get'>

const SOURCE_LABEL: Record<string, string> = {
  gsc: 'Search Console',
  dataforseo: 'DataForSEO',
  ai_estimate: 'AI estimate'
}
const DIFF_VARIANT = { low: 'success', medium: 'warning', high: 'destructive' } as const
const TYPES = CONTENT_TYPES.filter((t) => t !== 'refresh' && t !== 'page')

function openLink(url: string) {
  void api('app.openExternal', { url }).catch(() => undefined)
}

export function ChooseStep({ content, onDone }: { content: Content; onDone: () => void }) {
  const r = content.research as unknown as ResearchData
  const nav = useNavigate()
  const { busy, run } = useAction()
  const rec = r.recommendation
  const recType = (TYPES as readonly string[]).includes(rec?.content_type)
    ? rec.content_type
    : (TYPES as readonly string[]).includes(content.type)
      ? content.type
      : 'blog post'
  const [keyword, setKeyword] = useState(rec?.keyword ?? r.keyword_options[0]?.keyword ?? content.topic ?? '')
  const [type, setType] = useState<string>(recType)
  const [length, setLength] = useState<LengthKey>('standard')
  const [notes, setNotes] = useState('')
  const [overrides, setOverrides] = useState<Overrides>(content.modelOverrides ?? {})
  const [error, setError] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<{ url: string; title?: string | null }[] | null>(null)
  const [alts, setAlts] = useState<{ keyword: string; why: string }[] | null>(null)
  const options = useMemo(() => r.keyword_options ?? [], [r])

  const submit = (force = false) =>
    run(
      'choose',
      async () => {
        setError(null)
        const res = await api('content.choose', {
          contentId: content.id,
          keyword,
          contentType: type as (typeof CONTENT_TYPES)[number],
          length,
          notes: notes || undefined,
          force,
          modelOverrides: Object.keys(overrides).length ? overrides : undefined
        })
        if (res.conflicts.length) {
          setConflicts(res.conflicts)
          setAlts(null)
        } else {
          setConflicts(null)
          onDone()
        }
      },
      setError
    )

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {rec && (
          <Callout
            kind={rec.worth_it ? 'success' : 'warning'}
            title={
              rec.worth_it
                ? `Recommendation: "${rec.keyword}" as a ${rec.content_type}`
                : 'The AI is not sure this is worth your time'
            }
          >
            {rec.why}
          </Callout>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Keyword options</CardTitle>
            <CardDescription>
              Click one to pick it. Volumes only come from real data sources; "AI estimate" means no number
              was available.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-2 font-medium">Keyword</th>
                  <th className="py-2 pr-2 font-medium">Intent</th>
                  <th className="py-2 pr-2 font-medium">Difficulty</th>
                  <th className="py-2 pr-2 font-medium">Volume</th>
                  <th className="py-2 font-medium">Why it fits</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {options.map((o) => (
                  <tr
                    key={o.keyword}
                    onClick={() => setKeyword(o.keyword)}
                    className={cn(
                      'cursor-pointer align-top hover:bg-accent/50',
                      keyword === o.keyword && 'bg-primary/10'
                    )}
                  >
                    <td className="py-2 pr-2 font-medium">
                      <span className="flex items-center gap-1">
                        {rec?.keyword === o.keyword && (
                          <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                        )}
                        {o.keyword}
                      </span>
                      {o.cannibalization_risk && (
                        <span className="mt-1 flex items-center gap-1 text-xs text-warning">
                          <AlertTriangle className="h-3 w-3" /> You may already have a page for this:{' '}
                          {o.cannibalization_risk}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-2 capitalize">{o.intent}</td>
                    <td className="py-2 pr-2">
                      <Badge variant={DIFF_VARIANT[o.difficulty_for_small_site] ?? 'outline'}>
                        {o.difficulty_for_small_site}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2">
                      {o.volume !== null ? o.volume.toLocaleString() : '–'}
                      <div className="text-xs text-muted-foreground">
                        {SOURCE_LABEL[o.volume_source] ?? o.volume_source}
                      </div>
                    </td>
                    <td className="py-2 text-muted-foreground">{o.why_it_fits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {r.competitor_snapshot?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Who ranks now</CardTitle>
              <CardDescription>Top results for the leading keyword.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {r.competitor_snapshot.map((c, i) => (
                <div key={i} className="rounded-md border p-3 text-sm">
                  <button
                    className="flex items-start gap-1 text-left font-medium hover:underline"
                    onClick={() => openLink(c.url)}
                  >
                    {c.title} <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                  </button>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{c.url}</div>
                  <div className="mt-1 flex gap-1.5">
                    <Badge variant="outline">{c.page_type}</Badge>
                    {c.approx_words && (
                      <Badge variant="outline">~{c.approx_words.toLocaleString()} words</Badge>
                    )}
                  </div>
                  <p className="mt-2">
                    <span className="font-medium">Covers:</span> {c.covers}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium">Misses:</span> {c.misses}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Content gap</CardTitle>
              <CardDescription>What a better page would include.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {r.content_gap?.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Questions people ask</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {r.questions?.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {r.sources?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Sources</CardTitle>
              {r.data_sources?.length ? (
                <CardDescription>Data used: {r.data_sources.join(', ')}</CardDescription>
              ) : null}
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {r.sources.map((s) => (
                  <li key={s}>
                    <button
                      className="truncate text-left text-primary hover:underline"
                      onClick={() => openLink(s)}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle>Your choice</CardTitle>
            <CardDescription>Pick or edit the keyword, then the type and length.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Focus keyword">
              <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            </Field>
            <Field label="Content type">
              <Select value={type} onChange={(e) => setType(e.target.value)} className="capitalize">
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Length">
              <LengthPicker value={length} onChange={setLength} />
            </Field>
            <Field label="Notes (optional)">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Anything the brief should cover"
              />
            </Field>
            <ModelOverrides value={overrides} onChange={setOverrides} />
            <ErrorText error={error} />
            <Button
              className="w-full"
              size="lg"
              loading={busy === 'choose'}
              disabled={keyword.trim().length < 2}
              onClick={() => void submit()}
            >
              Write the brief <ArrowRight />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              loading={busy === 'rerun'}
              onClick={() => run('rerun', () => api('content.rerunResearch', { id: content.id }))}
            >
              <RotateCcw /> Research again
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(conflicts)} onOpenChange={(o) => !o && setConflicts(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>You already have a page for this</DialogTitle>
            <DialogDescription>
              Two pages chasing the same search compete with each other and both can rank worse.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            {conflicts?.map((c) => (
              <li key={c.url} className="rounded-md border p-2">
                <div className="font-medium">{c.title || c.url}</div>
                <div className="truncate text-xs text-muted-foreground">{c.url}</div>
              </li>
            ))}
          </ul>
          {alts && (
            <div className="space-y-2">
              <div className="text-sm font-medium">More specific keywords:</div>
              {alts.map((a) => (
                <button
                  key={a.keyword}
                  className="block w-full rounded-md border p-2 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    setKeyword(a.keyword)
                    setConflicts(null)
                  }}
                >
                  <div className="font-medium">{a.keyword}</div>
                  <div className="text-muted-foreground">{a.why}</div>
                </button>
              ))}
            </div>
          )}
          <DialogFooter className="sm:justify-start">
            <Button
              variant="outline"
              loading={busy === 'improve'}
              onClick={() =>
                run('improve', async () => {
                  const id = await api('content.improveExisting', {
                    contentId: content.id,
                    url: conflicts![0].url
                  })
                  nav(`/content/${id}`)
                })
              }
            >
              Improve the existing page instead
            </Button>
            <Button
              variant="outline"
              loading={busy === 'alts'}
              onClick={() =>
                run('alts', async () =>
                  setAlts(
                    await api('content.altKeywords', {
                      contentId: content.id,
                      keyword,
                      existing: conflicts!.map((c) => c.title || c.url).join(', ')
                    })
                  )
                )
              }
            >
              Target a more specific keyword
            </Button>
            <Button variant="secondary" loading={busy === 'choose'} onClick={() => void submit(true)}>
              Continue anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

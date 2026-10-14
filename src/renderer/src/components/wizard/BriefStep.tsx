import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GripVertical, Plus, Trash2, ArrowRight, RotateCcw } from 'lucide-react'
import { api, type RouteOutput } from '@/lib/api'
import { useAction } from '@/hooks/useApi'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { ErrorText } from '@/components/ui/misc'
import { cn } from '@/lib/utils'
import type { BriefData, OutlineItem } from './types'

type Content = RouteOutput<'content.get'>

export function BriefStep({ content }: { content: Content }) {
  const brief = content.brief as unknown as BriefData
  const nav = useNavigate()
  const { busy, run } = useAction()
  const [h1, setH1] = useState(brief.h1 || content.title || '')
  const [outline, setOutline] = useState<OutlineItem[]>(brief.outline ?? [])
  const [cta, setCta] = useState(brief.cta ?? '')
  const [facts, setFacts] = useState<Record<string, string>>(content.facts ?? {})
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const update = (i: number, patch: Partial<OutlineItem>) =>
    setOutline((o) => o.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const move = (from: number, to: number) =>
    setOutline((o) => {
      const next = [...o]
      const [item] = next.splice(from, 1)
      next.splice(to > from ? to - 1 : to, 0, item)
      return next
    })

  const save = () =>
    api('content.saveBrief', {
      contentId: content.id,
      outline: outline.filter((o) => o.heading.trim()),
      facts,
      cta,
      h1
    })
  const write = () =>
    run(
      'write',
      async () => {
        if (!outline.some((o) => o.heading.trim()))
          throw new Error('Add at least one section to the outline.')
        await save()
        await api('content.write', { id: content.id })
        nav(`/content/${content.id}`)
      },
      setError
    )
  const unanswered = brief.facts_needed?.filter((f) => !facts[f.key]?.trim()).length ?? 0

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>The brief</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm md:grid-cols-3">
            <div>
              <div className="font-medium">Search intent</div>
              <p className="text-muted-foreground">{brief.search_intent}</p>
            </div>
            <div>
              <div className="font-medium">Audience</div>
              <p className="text-muted-foreground">{brief.audience}</p>
            </div>
            <div>
              <div className="font-medium">Angle</div>
              <p className="text-muted-foreground">{brief.angle}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outline</CardTitle>
            <CardDescription>
              Drag sections to reorder. Edit headings and key points, add or remove sections.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Page title (H1)">
              <Input value={h1} onChange={(e) => setH1(e.target.value)} />
            </Field>
            <ol className="space-y-2">
              {outline.map((o, i) => (
                <li
                  key={i}
                  draggable
                  onDragStart={() => setDrag(i)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setOver(i)
                  }}
                  onDragEnd={() => {
                    setDrag(null)
                    setOver(null)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (drag !== null && drag !== i) move(drag, i)
                    setDrag(null)
                    setOver(null)
                  }}
                  className={cn(
                    'flex gap-2 rounded-md border bg-card p-2',
                    o.level === 3 && 'ml-8',
                    drag === i && 'opacity-50',
                    over === i && drag !== i && 'border-primary'
                  )}
                >
                  <GripVertical
                    className="mt-2 h-4 w-4 shrink-0 cursor-grab text-muted-foreground"
                    aria-label="Drag to reorder"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <Select
                        className="w-20"
                        value={o.level}
                        onChange={(e) => update(i, { level: Number(e.target.value) })}
                        aria-label="Heading level"
                      >
                        <option value={2}>H2</option>
                        <option value={3}>H3</option>
                      </Select>
                      <Input
                        value={o.heading}
                        onChange={(e) => update(i, { heading: e.target.value })}
                        placeholder="Section heading"
                      />
                    </div>
                    <Textarea
                      rows={Math.max(2, o.key_points.length)}
                      value={o.key_points.join('\n')}
                      onChange={(e) => update(i, { key_points: e.target.value.split('\n') })}
                      placeholder="Key points, one per line"
                      className="text-xs"
                    />
                  </div>
                  <button
                    aria-label="Remove section"
                    className="self-start rounded p-1 text-muted-foreground hover:text-destructive"
                    onClick={() => setOutline((x) => x.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ol>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOutline((o) => [...o, { heading: '', level: 2, key_points: [] }])}
            >
              <Plus /> Add section
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {brief.questions?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Questions to answer</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {brief.questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Pages to link to</CardTitle>
              <CardDescription>Only pages that exist on your site.</CardDescription>
            </CardHeader>
            <CardContent>
              {!brief.internal_links?.length && (
                <p className="text-sm text-muted-foreground">
                  None found yet. The SEO pass suggests more after writing.
                </p>
              )}
              <ul className="space-y-1 text-sm">
                {brief.internal_links?.map((l) => (
                  <li key={l.url}>
                    <span className="font-medium">{l.anchor}</span>{' '}
                    <span className="text-muted-foreground">→ {l.url}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
        {brief.secondary_keywords?.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="mr-1 text-muted-foreground">Secondary keywords:</span>
            {brief.secondary_keywords.map((k) => (
              <Badge key={k} variant="secondary">
                {k}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div>
        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle>Facts I need from you</CardTitle>
            <CardDescription>
              Anything you leave blank becomes a yellow [CONFIRM] placeholder. You must fill or dismiss those
              before sending.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!brief.facts_needed?.length && (
              <p className="text-sm text-muted-foreground">
                Nothing needed. Your business profile covers it.
              </p>
            )}
            {brief.facts_needed?.map((f) => (
              <Field key={f.key} label={f.question}>
                <Input
                  value={facts[f.key] ?? ''}
                  onChange={(e) => setFacts((x) => ({ ...x, [f.key]: e.target.value }))}
                />
              </Field>
            ))}
            <Field label="Call to action">
              <Textarea rows={2} value={cta} onChange={(e) => setCta(e.target.value)} />
            </Field>
            <ErrorText error={error} />
            {unanswered > 0 && (
              <p className="text-xs text-warning">
                {unanswered} fact{unanswered === 1 ? '' : 's'} unanswered.
              </p>
            )}
            <Button className="w-full" size="lg" loading={busy === 'write'} onClick={() => void write()}>
              Write it <ArrowRight />
            </Button>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                loading={busy === 'save'}
                onClick={() => run('save', save)}
              >
                Save brief
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                loading={busy === 'redo'}
                onClick={() => run('redo', () => api('content.redoBrief', { id: content.id }))}
              >
                <RotateCcw /> New brief
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

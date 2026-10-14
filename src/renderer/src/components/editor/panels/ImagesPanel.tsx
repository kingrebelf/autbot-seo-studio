import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Upload, Check, Wand2, Save, ImagePlus } from 'lucide-react'
import { api } from '@/lib/api'
import { useApi, useAction } from '@/hooks/useApi'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea, Select, Field, Checkbox, Label } from '@/components/ui/input'
import { Callout, Loading } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { useEditorCtx } from '../context'
import { mediaSrc, type ImageView } from '../types'
import { slotLabel } from '../InsertImageDialog'
import { Section } from './Section'

interface PlannedSlot {
  slot: string
  prompt: string
  count: number
}

const slotOrder = (s: string | null) => (s === 'featured' ? -1 : Number(s?.split('-')[1] ?? 99))

function ImageDetails({ image, vision }: { image: ImageView; vision: boolean }) {
  const { flushSave, reload } = useEditorCtx()
  const { busy, run } = useAction()
  const pick = (im: ImageView) => ({
    filename: im.filename,
    alt: im.alt ?? '',
    title: im.title ?? '',
    caption: im.caption ?? '',
    description: im.description ?? ''
  })
  const [f, setF] = useState(pick(image))
  // Reset only when a different image (or a newer save) arrives, not on every reload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setF(pick(image)), [image.id, image.updatedAt])
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))

  const save = () =>
    run('save', async () => {
      await flushSave()
      await api('images.update', { id: image.id, ...f })
      await reload()
      toast({ kind: 'success', title: 'Image details saved' })
    })
  const describe = () =>
    run('describe', async () => {
      await flushSave()
      const t = await api('images.describe', { id: image.id })
      setF({
        filename: t.filename,
        alt: t.alt.slice(0, 125),
        title: t.title,
        caption: t.caption,
        description: t.description
      })
      await reload()
    })

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <Field label="SEO filename">
        <Input value={f.filename} onChange={(e) => set('filename', e.target.value)} />
      </Field>
      <Field
        label="Alt text"
        hint={
          <span className={cn(f.alt.length > 125 && 'text-destructive')}>
            {f.alt.length} / 125 characters. Describe what's in the picture.
          </span>
        }
      >
        <Input value={f.alt} maxLength={125} onChange={(e) => set('alt', e.target.value)} />
      </Field>
      <Field label="Title">
        <Input value={f.title} onChange={(e) => set('title', e.target.value)} />
      </Field>
      <Field label="Caption (optional)">
        <Input value={f.caption} onChange={(e) => set('caption', e.target.value)} />
      </Field>
      <Field label="Description (for the media library)">
        <Textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={busy === 'save'} disabled={busy !== null} onClick={() => void save()}>
          <Save /> Save details
        </Button>
        {vision && (
          <Button
            size="sm"
            variant="outline"
            loading={busy === 'describe'}
            disabled={busy !== null}
            onClick={() => void describe()}
          >
            <Wand2 /> Write text again
          </Button>
        )}
      </div>
      {(image.prompt || image.modelId) && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">How this image was made</summary>
          {image.modelId && (
            <div className="mt-1">
              Model: <span className="font-mono">{image.modelId}</span>
            </div>
          )}
          {image.prompt && <div className="mt-1 whitespace-pre-wrap">Prompt: {image.prompt}</div>}
        </details>
      )}
    </div>
  )
}

export function ImagesPanel() {
  const { content, flushSave, reload } = useEditorCtx()
  const avail = useApi('images.available', undefined)
  const { busy, run } = useAction()
  const [featured, setFeatured] = useState(true)
  const [inline, setInline] = useState(2)
  const [plan, setPlan] = useState<PlannedSlot[] | null>(null)
  const jobActive = Boolean(content.activeJob)

  const groups = useMemo(() => {
    const m = new Map<string, ImageView[]>()
    for (const im of content.images) {
      const k = im.slot ?? 'featured'
      m.set(k, [...(m.get(k) ?? []), im])
    }
    return [...m.entries()].sort((a, b) => slotOrder(a[0]) - slotOrder(b[0]))
  }, [content.images])

  if (avail.loading && !avail.data) return <Loading />
  const generate = Boolean(avail.data?.generate)
  const vision = Boolean(avail.data?.vision)

  const makePlan = () =>
    run('plan', async () => {
      const slots = [
        ...(featured ? ['featured'] : []),
        ...Array.from({ length: inline }, (_, i) => `inline-${i + 1}`)
      ]
      if (!slots.length) {
        toast({ kind: 'info', title: 'Choose at least one image' })
        return
      }
      const r = await api('images.plan', { contentId: content.id, slots })
      setPlan(r.map((p) => ({ ...p, count: 2 })))
    })

  const startGenerate = (slots: PlannedSlot[]) =>
    run('generate', async () => {
      await api('images.generate', { contentId: content.id, slots })
      toast({ kind: 'info', title: 'Generating images', body: 'Options appear here as they finish.' })
      setPlan(null)
      await reload()
    })

  const choose = (im: ImageView) =>
    run(`pick:${im.id}`, async () => {
      await flushSave()
      await api('images.pick', { id: im.id })
      await reload()
      toast({
        kind: 'success',
        title: 'Image chosen',
        body: im.slot === 'featured' ? 'It will be the featured image.' : 'It was placed in the article.'
      })
    })

  const addOwn = (slot: string) =>
    run(`own:${slot}`, async () => {
      await flushSave()
      const r = await api('images.addOwn', { siteId: content.siteId, contentId: content.id, slot })
      if (r) await reload()
    })

  return (
    <div className="space-y-6">
      {!generate && (
        <Callout kind="info">
          Connect an image-capable model in Settings &gt; AI Models to generate images.
          {!vision && ' You can still add your own photos; type their alt text and details by hand.'}
        </Callout>
      )}

      {generate && !plan && (
        <Section
          title="Create images"
          hint="The AI writes a prompt for each image from the article and your site's image style."
        >
          <div className="space-y-3 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Featured image
              (also used when shared on social media)
            </label>
            <div className="flex items-center gap-2">
              <Label htmlFor="inline-count">In-article images</Label>
              <Select
                id="inline-count"
                className="w-20"
                value={inline}
                onChange={(e) => setInline(Number(e.target.value))}
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>
            <Button size="sm" loading={busy === 'plan'} disabled={jobActive} onClick={() => void makePlan()}>
              <Sparkles /> Write image prompts
            </Button>
          </div>
        </Section>
      )}

      {plan && (
        <Section
          title="Image prompts"
          hint="Edit any prompt, choose how many options you want, then generate."
        >
          <div className="space-y-3">
            {plan.map((p, i) => (
              <div key={p.slot} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{slotLabel(p.slot)}</span>
                  <Select
                    aria-label="Options"
                    className="h-8 w-28"
                    value={p.count}
                    onChange={(e) =>
                      setPlan(
                        (xs) =>
                          xs && xs.map((x, j) => (j === i ? { ...x, count: Number(e.target.value) } : x))
                      )
                    }
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n} option{n > 1 ? 's' : ''}
                      </option>
                    ))}
                  </Select>
                </div>
                <Textarea
                  rows={4}
                  value={p.prompt}
                  onChange={(e) =>
                    setPlan((xs) => xs && xs.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)))
                  }
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button
                size="sm"
                loading={busy === 'generate'}
                disabled={jobActive || plan.some((p) => p.prompt.trim().length < 3)}
                onClick={() => void startGenerate(plan)}
              >
                <Sparkles /> Generate
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPlan(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </Section>
      )}

      {groups.length === 0 && !plan && (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>No images yet.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              loading={busy === 'own:featured'}
              onClick={() => void addOwn('featured')}
            >
              <Upload /> Use my own featured image
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={busy === 'own:inline-1'}
              onClick={() => void addOwn('inline-1')}
            >
              <ImagePlus /> Use my own in-article image
            </Button>
          </div>
        </div>
      )}

      {groups.map(([slot, images]) => {
        const selected = images.find((i) => i.selected)
        const prompt = images.find((i) => i.prompt)?.prompt
        return (
          <Section
            key={slot}
            title={slotLabel(slot)}
            actions={
              <>
                {generate && prompt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    disabled={jobActive || busy !== null}
                    onClick={() => void startGenerate([{ slot, prompt, count: 2 }])}
                  >
                    <Sparkles /> More options
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  loading={busy === `own:${slot}`}
                  disabled={busy !== null}
                  onClick={() => void addOwn(slot)}
                >
                  <Upload /> Use my own image
                </Button>
              </>
            }
          >
            <div className="grid grid-cols-2 gap-2">
              {images.map((im) => (
                <div
                  key={im.id}
                  className={cn('overflow-hidden rounded-md border', im.selected && 'ring-2 ring-primary')}
                >
                  <img
                    src={mediaSrc(im.id)}
                    alt={im.alt ?? ''}
                    className="aspect-video w-full bg-muted object-cover"
                    loading="lazy"
                  />
                  <div className="flex items-center justify-between gap-1 p-1.5">
                    {im.aiGenerated ? (
                      <Badge variant="secondary">AI</Badge>
                    ) : (
                      <Badge variant="outline">Yours</Badge>
                    )}
                    {im.selected ? (
                      <Badge variant="success">
                        <Check className="h-3 w-3" /> Chosen
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        loading={busy === `pick:${im.id}`}
                        disabled={busy !== null}
                        onClick={() => void choose(im)}
                      >
                        Use this
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {selected ? (
              <ImageDetails image={selected} vision={vision} />
            ) : (
              <p className="text-xs text-muted-foreground">Pick one option to use it.</p>
            )}
          </Section>
        )
      })}
    </div>
  )
}

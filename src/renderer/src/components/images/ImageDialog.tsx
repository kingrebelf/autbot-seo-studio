import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Sparkles, Trash2 } from 'lucide-react'
import { api, type RouteOutput } from '@/lib/api'
import { useAction } from '@/hooks/useApi'
import { cn, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { ErrorText } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'

export type LibraryImage = RouteOutput<'images.library'>[number]
export type ContentSummary = RouteOutput<'content.list'>[number]

export const imageSrc = (id: number, updatedAt?: number) =>
  `autbot-media://img/${id}${updatedAt ? `?v=${updatedAt}` : ''}`

export const SLOTS = [
  { value: 'featured', label: 'Featured image (top of the page, social sharing)' },
  ...[1, 2, 3, 4, 5].map((n) => ({ value: `inline-${n}`, label: `In the article, after section ${n}` }))
]

export function slotLabel(slot: string | null): string {
  if (!slot || slot === 'library') return 'Library'
  if (slot === 'featured') return 'Featured'
  const n = slot.split('-')[1]
  return n ? `Section ${n}` : slot
}

const ALT_MAX = 125

interface Props {
  image: LibraryImage | null
  content: ContentSummary[]
  canDescribe: boolean
  onClose: () => void
  onChanged: () => void
}

export function ImageDialog({ image, content, canDescribe, onClose, onChanged }: Props) {
  const nav = useNavigate()
  const [filename, setFilename] = useState('')
  const [alt, setAlt] = useState('')
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [description, setDescription] = useState('')
  const [useContent, setUseContent] = useState('')
  const [useSlot, setUseSlot] = useState('featured')
  const [error, setError] = useState<string | null>(null)
  const { busy, run } = useAction()
  const [ask, confirmDialog] = useConfirm()

  const load = (im: LibraryImage) => {
    setFilename(im.filename.replace(/\.[a-z0-9]+$/i, ''))
    setAlt(im.alt ?? '')
    setTitle(im.title ?? '')
    setCaption(im.caption ?? '')
    setDescription(im.description ?? '')
  }

  useEffect(() => {
    if (!image) return
    load(image)
    setUseContent('')
    setUseSlot('featured')
    setError(null)
  }, [image])

  if (!image) return null
  const ext = image.filename.match(/\.[a-z0-9]+$/i)?.[0] ?? ''
  const linked = image.contentId ? content.find((c) => c.id === image.contentId) : undefined
  const dirty =
    filename !== image.filename.replace(/\.[a-z0-9]+$/i, '') ||
    alt !== (image.alt ?? '') ||
    title !== (image.title ?? '') ||
    caption !== (image.caption ?? '') ||
    description !== (image.description ?? '')

  const save = () =>
    run(
      'save',
      async () => {
        if (alt.length > ALT_MAX) throw new Error(`Alt text must be ${ALT_MAX} characters or fewer.`)
        await api('images.update', {
          id: image.id,
          filename: filename.trim() || undefined,
          alt,
          title,
          caption,
          description
        })
        toast({
          kind: 'success',
          title: 'Image details saved',
          body: image.contentId ? 'The article using it was updated too.' : undefined
        })
        onChanged()
      },
      setError
    )

  const describe = () =>
    run(
      'describe',
      async () => {
        const t = await api('images.describe', { id: image.id })
        setFilename(t.filename.replace(/\.[a-z0-9]+$/i, ''))
        setAlt(t.alt)
        setTitle(t.title)
        setCaption(t.caption)
        setDescription(t.description)
        toast({
          kind: 'success',
          title: 'New text details written and saved',
          body: 'Read them over and tweak anything that is not quite right.'
        })
        onChanged()
      },
      setError
    )

  const remove = async () => {
    const body = image.contentId
      ? `It will also be taken out of "${linked?.title ?? 'the article that uses it'}". This can't be undone.`
      : "The file is deleted from your computer. This can't be undone."
    if (!(await ask({ title: 'Delete this image?', body, confirm: 'Delete', danger: true }))) return
    await run('delete', async () => {
      await api('images.delete', { id: image.id })
      toast({ kind: 'success', title: 'Image deleted' })
      onChanged()
      onClose()
    })
  }

  const reuse = () =>
    run(
      'reuse',
      async () => {
        const cid = Number(useContent)
        if (!cid) throw new Error('Pick the piece to use this image in.')
        await api('images.reuse', { id: image.id, contentId: cid, slot: useSlot })
        const piece = content.find((c) => c.id === cid)
        toast({
          kind: 'success',
          title: 'Image added',
          body: `Now in "${piece?.title ?? piece?.topic ?? 'your piece'}".`,
          action: { label: 'Open it', onClick: () => nav(`/content/${cid}`) }
        })
        onChanged()
      },
      setError
    )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{image.filename}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-3">
            <div className="overflow-hidden rounded-md border bg-muted/40">
              <img
                src={imageSrc(image.id, image.updatedAt)}
                alt={image.alt ?? ''}
                className="max-h-80 w-full object-contain"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {image.aiGenerated ? <Badge>AI-generated</Badge> : <Badge variant="secondary">Uploaded</Badge>}
              {image.width && image.height && (
                <Badge variant="outline">
                  {image.width} × {image.height}
                </Badge>
              )}
              <Badge variant="outline">{slotLabel(image.slot)}</Badge>
              <Badge variant="outline">Added {formatDate(image.createdAt)}</Badge>
            </div>
            {image.aiGenerated && (
              <div className="space-y-1 rounded-md bg-muted/50 p-3 text-xs">
                <div className="font-medium">How it was made</div>
                {image.modelId && <div className="text-muted-foreground">Model: {image.modelId}</div>}
                {image.prompt && (
                  <p className="whitespace-pre-wrap text-muted-foreground">Prompt: {image.prompt}</p>
                )}
              </div>
            )}
            {image.contentId && (
              <Button variant="outline" size="sm" onClick={() => nav(`/content/${image.contentId}`)}>
                <ExternalLink /> Used in: {linked?.title ?? linked?.topic ?? `piece #${image.contentId}`}
              </Button>
            )}

            <div className="space-y-2 rounded-md border p-3">
              <div className="text-sm font-medium">Use in a piece</div>
              {content.length ? (
                <>
                  <Select
                    value={useContent}
                    onChange={(e) => setUseContent(e.target.value)}
                    aria-label="Piece"
                  >
                    <option value="">Pick a piece…</option>
                    {content.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title ?? c.topic} ({c.status})
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={useSlot}
                    onChange={(e) => setUseSlot(e.target.value)}
                    aria-label="Where in the piece"
                  >
                    {SLOTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void reuse()}
                    loading={busy === 'reuse'}
                    disabled={!useContent}
                  >
                    Add to piece
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  You have no content yet. Create a piece first, then come back to add this image.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Text details</h4>
              {canDescribe && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void describe()}
                  loading={busy === 'describe'}
                >
                  {busy !== 'describe' && <Sparkles />} Regenerate text details
                </Button>
              )}
            </div>
            <Field
              label="File name"
              hint="Short words joined by dashes help search engines, e.g. spring-lawn-aeration."
            >
              <div className="flex items-center gap-1">
                <Input value={filename} onChange={(e) => setFilename(e.target.value)} />
                <span className="text-sm text-muted-foreground">{ext}</span>
              </div>
            </Field>
            <Field
              label={
                <span className="flex w-full justify-between">
                  <span>Alt text</span>
                  <span
                    className={cn(
                      'text-xs font-normal',
                      alt.length > ALT_MAX ? 'text-destructive' : 'text-muted-foreground'
                    )}
                  >
                    {alt.length}/{ALT_MAX}
                  </span>
                </span>
              }
              hint="Describes the image for people who can't see it. Mention the keyword only if it fits naturally."
            >
              <Textarea value={alt} onChange={(e) => setAlt(e.target.value)} rows={2} maxLength={ALT_MAX} />
            </Field>
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Caption (optional)">
              <Input value={caption} onChange={(e) => setCaption(e.target.value)} />
            </Field>
            <Field label="Description" hint="Longer text for the WordPress media library.">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </Field>
            <ErrorText error={error} />
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => void remove()}
            loading={busy === 'delete'}
          >
            {busy !== 'delete' && <Trash2 />} Delete image
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => void save()} loading={busy === 'save'} disabled={!dirty}>
              Save details
            </Button>
          </div>
        </div>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  )
}

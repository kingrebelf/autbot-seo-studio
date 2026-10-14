import type { Editor } from '@tiptap/react'
import { Upload } from 'lucide-react'
import { api } from '@/lib/api'
import { useAction } from '@/hooks/useApi'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useEditorCtx } from './context'
import { mediaSrc, type ImageView } from './types'
import { headingsOf } from './extensions'

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function figureHtml(im: Pick<ImageView, 'id' | 'alt' | 'title' | 'caption'>): string {
  const img = `<img src="${mediaSrc(im.id)}" data-image-id="${im.id}" alt="${escapeAttr(im.alt ?? '')}" title="${escapeAttr(im.title ?? '')}">`
  return `<figure>${img}${im.caption ? `<figcaption>${escapeAttr(im.caption)}</figcaption>` : ''}</figure>`
}

export function slotLabel(slot: string | null): string {
  if (!slot || slot === 'featured') return 'Featured image'
  const n = slot.split('-')[1]
  return n ? `In-article image ${n}` : slot
}

/** Which H2 section (1-based) the cursor is in, for placing a new image there. */
function sectionNumber(editor: Editor): number {
  const pos = editor.state.selection.from
  const h2s = headingsOf(editor.state.doc).filter((h) => h.level === 2)
  let n = 0
  for (const h of h2s) if (h.pos <= pos) n++
  return Math.max(1, n)
}

/** Insert one of the piece's images at the cursor, or add the owner's own photo. */
export function InsertImageDialog({
  editor,
  open,
  onOpenChange
}: {
  editor: Editor
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { content, flushSave, reload } = useEditorCtx()
  const { busy, run } = useAction()
  const usable = content.images.filter((i) => i.selected)
  const inBody = new Set(
    [...(content.bodyHtml ?? '').matchAll(/data-image-id="(\d+)"/g)].map((m) => Number(m[1]))
  )

  const addOwnImage = () =>
    run('own', async () => {
      await flushSave()
      const n = sectionNumber(editor)
      const used = new Set(content.images.map((i) => i.slot))
      const slot = used.has(`inline-${n}`) ? `inline-${n}-own${Date.now()}` : `inline-${n}`
      const r = await api('images.addOwn', { siteId: content.siteId, contentId: content.id, slot })
      if (!r) return
      await reload()
      toast({
        kind: 'success',
        title: 'Image added',
        body: 'It was placed in the section your cursor was in. Check its alt text in the Images tab.'
      })
      onOpenChange(false)
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Insert an image</DialogTitle>
          <DialogDescription>
            Pick one of this piece's images to put at the cursor, or add your own photo. Generate new images
            in the Images tab.
          </DialogDescription>
        </DialogHeader>
        {usable.length ? (
          <div className="grid grid-cols-3 gap-3">
            {usable.map((im) => (
              <button
                key={im.id}
                type="button"
                className="group overflow-hidden rounded-md border text-left hover:ring-2 hover:ring-primary"
                onClick={() => {
                  editor.chain().focus().insertContent(figureHtml(im)).run()
                  onOpenChange(false)
                }}
              >
                <img
                  src={mediaSrc(im.id)}
                  alt={im.alt ?? ''}
                  className="aspect-video w-full bg-muted object-cover"
                />
                <div className="p-2 text-xs">
                  <div className="font-medium">{slotLabel(im.slot)}</div>
                  <div className="truncate text-muted-foreground">{im.alt || im.filename}</div>
                  {inBody.has(im.id) && <div className="text-muted-foreground">Already in the article</div>}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">This piece has no chosen images yet.</p>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => void addOwnImage()} loading={busy === 'own'}>
            <Upload /> Use my own image
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

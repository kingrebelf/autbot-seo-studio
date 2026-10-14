import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import { Input, Field } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'

/** Add, change or remove a link on the selected text. */
export function LinkDialog({
  editor,
  open,
  onOpenChange
}: {
  editor: Editor
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [hadSelection, setHadSelection] = useState(false)

  useEffect(() => {
    if (!open) return
    const attrs = editor.getAttributes('link') as { href?: string }
    setUrl(attrs.href ?? '')
    const { from, to, empty } = editor.state.selection
    setHadSelection(!empty)
    setText(empty ? '' : editor.state.doc.textBetween(from, to, ' '))
  }, [open, editor])

  const apply = () => {
    let href = url.trim()
    if (!href) return
    if (!/^(https?:|mailto:|tel:|\/|#)/i.test(href)) href = `https://${href}`
    const chain = editor.chain().focus().extendMarkRange('link')
    if (hadSelection || editor.isActive('link')) chain.setLink({ href }).run()
    else
      chain
        .insertContent({
          type: 'text',
          text: text.trim() || href,
          marks: [{ type: 'link', attrs: { href } }]
        })
        .run()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link</DialogTitle>
          <DialogDescription>
            Paste the page address. Links to your own site help readers and search engines.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            apply()
          }}
        >
          <Field label="Address">
            <Input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/page"
            />
          </Field>
          {!hadSelection && !editor.isActive('link') && (
            <Field label="Text to show">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Leave empty to show the address"
              />
            </Field>
          )}
          <DialogFooter>
            {editor.isActive('link') && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run()
                  onOpenChange(false)
                }}
              >
                Remove link
              </Button>
            )}
            <Button type="submit" disabled={!url.trim()}>
              Save link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Wand2 } from 'lucide-react'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input, Field } from '@/components/ui/input'
import { ErrorText } from '@/components/ui/misc'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { unwrapSingleParagraph } from './extensions'

export interface AiTarget {
  kind: 'rewrite' | 'section'
  from: number
  to: number
  /** Plain text (rewrite) or HTML (section) sent to the AI. */
  source: string
  heading?: string
  /** True when the selection sits inside one paragraph (keep the result inline). */
  inline: boolean
}

const QUICK: Record<AiTarget['kind'], string[]> = {
  rewrite: [
    'Make it shorter',
    'Use simpler words',
    'Make it friendlier',
    'More persuasive',
    'Fix grammar only'
  ],
  section: [
    'Add more practical detail',
    'Make it shorter',
    'Add a short list',
    'Answer the question more directly'
  ]
}

/** Instruction box -> AI -> preview -> replace. Used for "Rewrite selection" and "Regenerate section". */
export function AiReplaceDialog({
  editor,
  contentId,
  target,
  onClose
}: {
  editor: Editor
  contentId: number
  target: AiTarget | null
  onClose: () => void
}) {
  const [instruction, setInstruction] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setInstruction('')
    setResult(null)
    setError(null)
  }, [target])

  if (!target) return null
  const isSection = target.kind === 'section'

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = isSection
        ? await api('content.regenerateSection', { id: contentId, sectionHtml: target.source, instruction })
        : await api('content.rewrite', { id: contentId, text: target.source, instruction })
      setResult(r)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const replace = () => {
    if (!result) return
    const html = target.inline ? unwrapSingleParagraph(result) : result
    // The document may have changed while the AI was working; clamp to its size.
    const size = editor.state.doc.content.size
    editor
      .chain()
      .focus()
      .insertContentAt({ from: Math.min(target.from, size), to: Math.min(target.to, size) }, html)
      .run()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>
            {isSection ? `Regenerate section: ${target.heading ?? ''}` : 'Rewrite selection'}
          </DialogTitle>
          <DialogDescription>
            {isSection
              ? 'The AI rewrites this section only. You see the new version before anything changes.'
              : 'Tell the AI what to change. You see the new version before anything changes.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Now</div>
            {isSection ? (
              <div
                className="prose-editor max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm"
                dangerouslySetInnerHTML={{ __html: target.source }}
              />
            ) : (
              <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
                {target.source}
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void generate()
            }}
          >
            <Field label="What should change? (optional)">
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={
                    isSection ? 'e.g. mention our 10-year warranty' : 'e.g. make it shorter and friendlier'
                  }
                />
                <Button type="submit" loading={busy}>
                  <Wand2 /> {result ? 'Try again' : 'Rewrite'}
                </Button>
              </div>
            </Field>
            <div className="mt-2 flex flex-wrap gap-1">
              {QUICK[target.kind].map((q) => (
                <button
                  key={q}
                  type="button"
                  className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent"
                  onClick={() => setInstruction(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </form>
          <ErrorText error={error} />
          {result !== null && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                New version
              </div>
              <div
                className="prose-editor max-h-72 overflow-y-auto rounded-md border border-primary/40 bg-primary/5 p-3 text-sm"
                dangerouslySetInnerHTML={{ __html: result }}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={replace} disabled={!result || busy}>
            Replace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

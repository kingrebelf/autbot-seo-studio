import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import Placeholder from '@tiptap/extension-placeholder'
import { Wand2, RefreshCw } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { Spinner } from '@/components/ui/misc'
import { ArticleImage, Figure, Figcaption, ConfirmHighlight, sectionAt } from './extensions'
import { Toolbar } from './Toolbar'
import { AiReplaceDialog, type AiTarget } from './AiDialogs'

/** Streamed HTML as readable text (tags dropped, including a half-received one at the end). */
function streamText(s: string): string {
  return s
    .replace(/<\/(p|h\d|li|ul|ol)>/gi, '\n\n')
    .replace(/<[^>]*(>|$)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The TipTap editor for the article body. `onChange` fires on every user edit. */
export function useArticleEditor(onChange: () => void): Editor | null {
  const cb = useRef(onChange)
  cb.current = onChange
  return useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { target: null, rel: null } }
      }),
      ArticleImage,
      Figure,
      Figcaption,
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      ConfirmHighlight
    ],
    content: '',
    editorProps: {
      attributes: {
        class:
          'prose-editor mx-auto max-w-3xl px-10 py-8 min-h-[60vh] [&_figcaption]:mt-1 [&_figcaption]:text-center [&_figcaption]:text-sm [&_figcaption]:text-muted-foreground [&_figure]:my-4',
        spellcheck: 'true'
      }
    },
    onUpdate: () => cb.current()
  })
}

/** Toolbar + editor + AI rewrite tools, or a live read-only view while the AI writes. */
export function EditorPane({
  editor,
  contentId,
  writing,
  stream
}: {
  editor: Editor
  contentId: number
  writing: boolean
  stream: string
}) {
  const [target, setTarget] = useState<AiTarget | null>(null)
  const streamEnd = useRef<HTMLDivElement>(null)

  // Follow the text as it streams in.
  useEffect(() => {
    if (writing) streamEnd.current?.scrollIntoView({ block: 'end' })
  }, [writing, stream])

  const openRewrite = () => {
    const { from, to, empty, $from, $to } = editor.state.selection
    if (empty) {
      toast({
        kind: 'info',
        title: 'Select some text first',
        body: 'Highlight the words you want rewritten.'
      })
      return
    }
    const text = editor.state.doc.textBetween(from, to, '\n')
    if (!text.trim()) return
    setTarget({
      kind: 'rewrite',
      from,
      to,
      source: text,
      inline: $from.sameParent($to) && $from.parent.isTextblock
    })
  }

  const openRegenerate = () => {
    const sec = sectionAt(editor, editor.state.selection.from)
    if (!sec) {
      toast({
        kind: 'info',
        title: 'Put the cursor inside a section',
        body: 'Click in the text under a heading, then try again.'
      })
      return
    }
    setTarget({
      kind: 'section',
      from: sec.from,
      to: sec.to,
      source: sec.html,
      heading: sec.heading,
      inline: false
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar editor={editor} disabled={writing} onRewrite={openRewrite} onRegenerate={openRegenerate} />
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="editor-scroll">
        {!writing && (
          <BubbleMenu
            editor={editor}
            shouldShow={({ state }) =>
              !state.selection.empty && editor.isEditable && !editor.isActive('image')
            }
          >
            <div className="flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={openRewrite}
              >
                <Wand2 className="h-3.5 w-3.5" /> Rewrite
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={openRegenerate}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Regenerate section
              </button>
            </div>
          </BubbleMenu>
        )}
        <EditorContent editor={editor} />
        {writing && (
          <div className="mx-auto max-w-3xl px-10 pb-10" aria-live="polite">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> The AI is writing the next section…
            </div>
            {stream && <p className="mt-3 whitespace-pre-wrap text-muted-foreground">{streamText(stream)}</p>}
            <div ref={streamEnd} />
          </div>
        )}
      </div>
      {target && (
        <AiReplaceDialog
          editor={editor}
          contentId={contentId}
          target={target}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  )
}

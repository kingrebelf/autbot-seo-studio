import { useEditorState, type Editor } from '@tiptap/react'
import { cn } from '@/lib/utils'
import { headingsOf } from './extensions'

/** Headings in the draft; click one to jump there. */
export function Outline({ editor }: { editor: Editor }) {
  const items = useEditorState({ editor, selector: ({ editor: e }) => headingsOf(e.state.doc) })
  const cursor = useEditorState({ editor, selector: ({ editor: e }) => e.state.selection.from })

  const jump = (pos: number) => {
    editor
      .chain()
      .focus()
      .setTextSelection(pos + 1)
      .run()
    const dom = editor.view.nodeDOM(pos)
    if (dom instanceof HTMLElement) dom.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  let current = -1
  items.forEach((h, i) => {
    if (h.pos <= cursor) current = i
  })

  return (
    <nav aria-label="Outline" className="p-3">
      <div className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Outline
      </div>
      {items.length === 0 ? (
        <p className="px-2 text-sm text-muted-foreground">Headings appear here as the draft grows.</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((h, i) => (
            <li key={`${h.pos}-${i}`}>
              <button
                type="button"
                onClick={() => jump(h.pos)}
                className={cn(
                  'w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-accent',
                  h.level === 1 && 'font-semibold',
                  h.level === 3 && 'pl-5 text-muted-foreground',
                  h.level >= 4 && 'pl-8 text-xs text-muted-foreground',
                  i === current && 'bg-primary/10 text-primary'
                )}
                title={h.text}
              >
                {h.text || <span className="italic text-muted-foreground">(empty heading)</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}

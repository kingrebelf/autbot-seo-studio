import { useState, type ReactNode } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link2,
  Image as ImageIcon,
  Table as TableIcon,
  Quote,
  Undo2,
  Redo2,
  Wand2,
  RefreshCw,
  Rows3,
  Columns3,
  Trash2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { LinkDialog } from './LinkDialog'
import { InsertImageDialog } from './InsertImageDialog'

function Btn({
  active,
  disabled,
  onClick,
  title,
  children
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-1.5 text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
        active && 'bg-primary/10 text-primary'
      )}
    >
      {children}
    </button>
  )
}

const Sep = () => <div className="mx-1 h-5 w-px bg-border" />

export function Toolbar({
  editor,
  disabled,
  onRewrite,
  onRegenerate
}: {
  editor: Editor
  disabled: boolean
  onRewrite: () => void
  onRegenerate: () => void
}) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      link: e.isActive('link'),
      quote: e.isActive('blockquote'),
      table: e.isActive('table'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      hasSelection: !e.state.selection.empty
    })
  })
  const c = () => editor.chain().focus()
  const off = disabled
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-background/95 px-2 py-1">
      <Btn
        title="Heading 1"
        active={s.h1}
        disabled={off}
        onClick={() => c().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 />
      </Btn>
      <Btn
        title="Heading 2"
        active={s.h2}
        disabled={off}
        onClick={() => c().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 />
      </Btn>
      <Btn
        title="Heading 3"
        active={s.h3}
        disabled={off}
        onClick={() => c().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 />
      </Btn>
      <Sep />
      <Btn title="Bold" active={s.bold} disabled={off} onClick={() => c().toggleBold().run()}>
        <Bold />
      </Btn>
      <Btn title="Italic" active={s.italic} disabled={off} onClick={() => c().toggleItalic().run()}>
        <Italic />
      </Btn>
      <Sep />
      <Btn title="Bullet list" active={s.bullet} disabled={off} onClick={() => c().toggleBulletList().run()}>
        <List />
      </Btn>
      <Btn
        title="Numbered list"
        active={s.ordered}
        disabled={off}
        onClick={() => c().toggleOrderedList().run()}
      >
        <ListOrdered />
      </Btn>
      <Btn title="Quote" active={s.quote} disabled={off} onClick={() => c().toggleBlockquote().run()}>
        <Quote />
      </Btn>
      <Sep />
      <Btn title="Link" active={s.link} disabled={off} onClick={() => setLinkOpen(true)}>
        <Link2 />
      </Btn>
      <Btn title="Image" disabled={off} onClick={() => setImageOpen(true)}>
        <ImageIcon />
      </Btn>
      <Btn
        title="Insert table"
        disabled={off || s.table}
        onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableIcon />
      </Btn>
      {s.table && (
        <>
          <Btn title="Add row" disabled={off} onClick={() => c().addRowAfter().run()}>
            <Rows3 />
          </Btn>
          <Btn title="Add column" disabled={off} onClick={() => c().addColumnAfter().run()}>
            <Columns3 />
          </Btn>
          <Btn title="Delete table" disabled={off} onClick={() => c().deleteTable().run()}>
            <Trash2 />
          </Btn>
        </>
      )}
      <Sep />
      <Btn title="Undo" disabled={off || !s.canUndo} onClick={() => c().undo().run()}>
        <Undo2 />
      </Btn>
      <Btn title="Redo" disabled={off || !s.canRedo} onClick={() => c().redo().run()}>
        <Redo2 />
      </Btn>
      <div className="ml-auto flex items-center gap-0.5">
        <Btn title="Rewrite the selected text with AI" disabled={off || !s.hasSelection} onClick={onRewrite}>
          <Wand2 /> <span className="text-xs">Rewrite selection</span>
        </Btn>
        <Btn title="Regenerate the section the cursor is in" disabled={off} onClick={onRegenerate}>
          <RefreshCw /> <span className="text-xs">Regenerate section</span>
        </Btn>
      </div>
      <LinkDialog editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />
      <InsertImageDialog editor={editor} open={imageOpen} onOpenChange={setImageOpen} />
    </div>
  )
}

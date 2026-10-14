import { useEffect, useMemo, useState } from 'react'
import { diffWords, diffLines } from 'diff'
import { RotateCcw } from 'lucide-react'
import { api } from '@/lib/api'
import { useApi, useAction } from '@/hooks/useApi'
import { Button } from '@/components/ui/button'
import { Select, Label } from '@/components/ui/input'
import { ErrorText, Loading } from '@/components/ui/misc'
import { useConfirm } from '@/components/ui/confirm'
import { toast } from '@/components/ui/toast'
import { cn, formatDateTime } from '@/lib/utils'
import { useEditorCtx } from '../context'
import { Section } from './Section'

const CURRENT = 'current'

/** Readable plain text from HTML, one block per line. */
function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(
    html.replace(/<\/(p|h\d|li|blockquote|tr|figure)>/gi, '$&\n'),
    'text/html'
  )
  return (doc.body.textContent ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
}

/** One tag-ending per line so a line diff of HTML is readable. */
function prettyHtml(html: string): string {
  return html.replace(/>\s*</g, '>\n<').trim() + '\n'
}

export function HistoryPanel() {
  const { content, editor, applyContent, flushSave } = useEditorCtx()
  const versions = useApi('content.versions', { id: content.id })
  const { busy, run } = useAction()
  const [ask, confirmDialog] = useConfirm()
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>(CURRENT)
  const [mode, setMode] = useState<'text' | 'html'>('text')
  const reloadVersions = versions.reload

  // New versions are saved on the server as the piece changes; refresh the list when it does.
  useEffect(() => {
    void reloadVersions()
  }, [content.updatedAt, reloadVersions])

  const list = versions.data ?? []
  const htmlOf = (key: string): string | null => {
    if (key === CURRENT) return editor ? editor.getHTML() : (content.bodyHtml ?? '')
    const v = list.find((x) => String(x.id) === key)
    return v ? (v.bodyHtml ?? '') : null
  }
  const fromKey = from || (list[0] ? String(list[0].id) : '')
  const a = htmlOf(fromKey)
  const b = htmlOf(to)

  const parts = useMemo(() => {
    if (a === null || b === null) return null
    return mode === 'text' ? diffWords(htmlToText(a), htmlToText(b)) : diffLines(prettyHtml(a), prettyHtml(b))
  }, [a, b, mode])
  const changed = parts?.some((p) => p.added || p.removed)

  const restore = (id: number, label: string) =>
    run(`restore:${id}`, async () => {
      const ok = await ask({
        title: 'Restore this version?',
        body: `The article and its meta go back to "${label}". The current version is saved in History first, so you can undo this.`,
        confirm: 'Restore'
      })
      if (!ok) return
      await flushSave()
      applyContent(await api('content.restoreVersion', { id: content.id, versionId: id }), { syncBody: true })
      await versions.reload()
      toast({ kind: 'success', title: 'Version restored' })
    })

  const labelOf = (v: (typeof list)[number]) => `${v.note || 'Saved'} · ${formatDateTime(v.createdAt)}`

  if (versions.loading && !versions.data) return <Loading />

  return (
    <div className="space-y-6">
      {confirmDialog}
      <ErrorText error={versions.error} />
      <Section
        title="Versions"
        hint="A copy is saved at each step: first draft, fixes, your edits, restores."
      >
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved versions yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {list.map((v) => (
              <li
                key={v.id}
                className={cn(
                  'flex items-center gap-2 p-2 text-sm',
                  String(v.id) === fromKey && 'bg-primary/5'
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setFrom(String(v.id))}
                  title="Compare this version"
                >
                  <div className="truncate font-medium">{v.note || 'Saved'}</div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</div>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  loading={busy === `restore:${v.id}`}
                  disabled={busy !== null || Boolean(content.activeJob)}
                  onClick={() => void restore(v.id, labelOf(v))}
                >
                  <RotateCcw /> Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {list.length > 0 && (
        <Section title="Compare">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="diff-from" className="text-xs">
                Older
              </Label>
              <Select id="diff-from" value={fromKey} onChange={(e) => setFrom(e.target.value)}>
                {list.map((v) => (
                  <option key={v.id} value={v.id}>
                    {labelOf(v)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="diff-to" className="text-xs">
                Newer
              </Label>
              <Select id="diff-to" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value={CURRENT}>Current (in the editor)</option>
                {list.map((v) => (
                  <option key={v.id} value={v.id}>
                    {labelOf(v)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="diff-mode"
                checked={mode === 'text'}
                onChange={() => setMode('text')}
              />{' '}
              Text
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="diff-mode"
                checked={mode === 'html'}
                onChange={() => setMode('html')}
              />{' '}
              HTML
            </label>
            <span className="ml-auto flex items-center gap-2 text-muted-foreground">
              <span className="rounded bg-success/15 px-1 text-success">added</span>
              <span className="rounded bg-destructive/15 px-1 text-destructive line-through">removed</span>
            </span>
          </div>
          {parts && !changed && <p className="text-sm text-muted-foreground">No differences.</p>}
          {parts && changed && (
            <div
              className={cn(
                'max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-md border p-3 text-sm leading-relaxed',
                mode === 'html' && 'font-mono text-xs'
              )}
            >
              {parts.map((p, i) => (
                <span
                  key={i}
                  className={cn(
                    p.added && 'rounded bg-success/15 text-success',
                    p.removed && 'rounded bg-destructive/15 text-destructive line-through'
                  )}
                >
                  {p.value}
                </span>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  )
}

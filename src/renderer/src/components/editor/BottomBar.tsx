import { useState } from 'react'
import {
  ClipboardCheck,
  ChevronUp,
  ChevronDown,
  Send,
  Download,
  Copy,
  Globe,
  Search,
  ExternalLink
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useAction } from '@/hooks/useApi'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { useEditorCtx } from './context'
import { REVIEW_ITEMS } from './types'
import { SentDialog, ExportDialog, PublishedDialog, copyText, type SendResult } from './PublishDialogs'
import { openExternal } from './panels/LinksPanel'

function normalizeChecklist(v: boolean[] | null): boolean[] {
  return REVIEW_ITEMS.map((_, i) => Boolean(v?.[i]))
}

export function BottomBar() {
  const { content, site, applyContent, flushSave, setTab } = useEditorCtx()
  const { busy, run } = useAction()
  const [ask, confirmDialog] = useConfirm()
  const [listOpen, setListOpen] = useState(content.status === 'Ready for review')
  const [sent, setSent] = useState<SendResult | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [published, setPublished] = useState<{ open: boolean; status: boolean }>({
    open: false,
    status: false
  })
  const items = normalizeChecklist(content.reviewChecklist)
  const done = items.filter(Boolean).length
  const writing = content.status === 'Writing' || content.status === 'Researching'
  const isPublished = content.status === 'Published' && Boolean(content.liveUrl)

  const toggle = (i: number, v: boolean) =>
    run(`check:${i}`, async () => {
      const next = items.map((x, j) => (j === i ? v : x))
      applyContent({ ...content, reviewChecklist: next })
      applyContent(await api('content.setChecklist', { id: content.id, items: next }))
    })

  const send = async (force: boolean): Promise<void> => {
    await flushSave()
    try {
      const r = await api('content.sendToWordPress', { id: content.id, force })
      setSent(r)
      // Pick up the new status and edit link.
      applyContent(await api('content.get', { id: content.id }))
    } catch (e) {
      if (e instanceof ApiError && e.code === 'checklist') {
        setListOpen(true)
        const ok = await ask({
          title: 'Send anyway?',
          body: "You haven't ticked every item on the Review checklist. It still goes to WordPress as a draft (never published), but please check it carefully there.",
          confirm: 'Send anyway'
        })
        if (ok) return send(true)
        return
      }
      if (e instanceof ApiError && e.code === 'confirm_block') {
        setTab('checks')
        toast({
          kind: 'error',
          title: 'Some facts still need confirming',
          body: e.message,
          action: { label: 'Open the Checks tab', onClick: () => setTab('checks') }
        })
        return
      }
      throw e
    }
  }

  const copyAs = (kind: 'html' | 'markdown') =>
    run(`copy:${kind}`, async () => {
      await flushSave()
      const r = await api('content.copyFormats', { id: content.id })
      await copyText(kind === 'html' ? r.html : r.markdown, kind === 'html' ? 'HTML' : 'Markdown')
    })

  return (
    <div className="border-t bg-muted/30">
      {confirmDialog}
      {listOpen && (
        <div className="border-b px-4 py-3">
          <div className="mb-2 text-sm font-medium">Review checklist: tick every item before sending</div>
          <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {REVIEW_ITEMS.map((label, i) => (
              <li key={label}>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={items[i]}
                    disabled={busy === `check:${i}`}
                    onChange={(e) => void toggle(i, e.target.checked)}
                  />
                  <span className={cn(items[i] && 'text-muted-foreground')}>{label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <Button variant="ghost" size="sm" onClick={() => setListOpen((o) => !o)} aria-expanded={listOpen}>
          <ClipboardCheck className={cn(done === items.length && 'text-success')} />
          Review checklist {done}/{items.length}
          {listOpen ? <ChevronDown /> : <ChevronUp />}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            loading={busy === 'copy:html'}
            disabled={writing}
            onClick={() => void copyAs('html')}
          >
            <Copy /> Copy HTML
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={busy === 'copy:markdown'}
            disabled={writing}
            onClick={() => void copyAs('markdown')}
          >
            <Copy /> Copy Markdown
          </Button>
          <Button variant="outline" size="sm" disabled={writing} onClick={() => setExportOpen(true)}>
            <Download /> Export
          </Button>
          {content.wpEditUrl && (
            <Button variant="outline" size="sm" onClick={() => openExternal(content.wpEditUrl ?? '')}>
              <ExternalLink /> Open in WordPress
            </Button>
          )}
          {isPublished ? (
            <Button variant="outline" size="sm" onClick={() => setPublished({ open: true, status: true })}>
              <Search /> Indexing
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={writing}
              onClick={() => setPublished({ open: true, status: false })}
            >
              <Globe /> Mark as published
            </Button>
          )}
          {site?.wpConnected && (
            <Button
              size="sm"
              loading={busy === 'send'}
              disabled={writing}
              onClick={() =>
                void run(
                  'send',
                  () => send(false),
                  (msg) => toast({ kind: 'error', title: "Couldn't send to WordPress", body: msg })
                )
              }
            >
              <Send /> {content.wpPostId ? 'Send to WordPress again (draft)' : 'Send to WordPress as Draft'}
            </Button>
          )}
        </div>
      </div>
      <SentDialog result={sent} onClose={() => setSent(null)} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <PublishedDialog
        open={published.open}
        startWithStatus={published.status}
        onOpenChange={(o) => setPublished((p) => ({ ...p, open: o }))}
      />
    </div>
  )
}

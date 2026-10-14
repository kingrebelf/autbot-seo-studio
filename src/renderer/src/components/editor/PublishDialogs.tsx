import { useEffect, useState } from 'react'
import { Copy, ExternalLink, FolderOpen, FileArchive, Search, Send, CheckCircle2 } from 'lucide-react'
import { EXPORT_FORMATS, type ExportFormat } from '@shared/types'
import { api, type RouteOutput } from '@/lib/api'
import { useApi, useAction } from '@/hooks/useApi'
import { Button } from '@/components/ui/button'
import { Input, Select, Field } from '@/components/ui/input'
import { Callout, ErrorText, Loading } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { formatDateTime } from '@/lib/utils'
import { useEditorCtx } from './context'
import { openExternal } from './panels/LinksPanel'

export type SendResult = RouteOutput<'content.sendToWordPress'>

export async function copyText(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast({ kind: 'success', title: `${what} copied` })
  } catch {
    toast({
      kind: 'error',
      title: "Couldn't copy to the clipboard",
      body: 'Select the text and copy it by hand.'
    })
  }
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex gap-2">
        <Input readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <Button
          variant="outline"
          size="icon"
          aria-label={`Copy ${label}`}
          onClick={() => void copyText(value, label)}
        >
          <Copy />
        </Button>
      </div>
    </div>
  )
}

const PLUGIN_NAMES: Record<string, string> = {
  yoast: 'Yoast SEO',
  rankmath: 'Rank Math',
  aioseo: 'All in One SEO'
}

/** After "Send to WordPress": the edit link, and the copy panel when SEO meta couldn't be written. */
export function SentDialog({ result, onClose }: { result: SendResult | null; onClose: () => void }) {
  if (!result) return null
  const plugin = result.seoPlugin ? (PLUGIN_NAMES[result.seoPlugin] ?? result.seoPlugin) : 'your SEO plugin'
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />{' '}
            {result.revision ? 'Saved as a draft revision' : 'Sent to WordPress as a draft'}
          </DialogTitle>
          <DialogDescription>
            Nothing is live yet. Open it in WordPress to check how it looks, then publish it there.
          </DialogDescription>
        </DialogHeader>
        <Button onClick={() => openExternal(result.editUrl)}>
          <ExternalLink /> Open in WordPress to review and publish
        </Button>
        {result.copyPanel && (
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm">
              The app couldn't write the SEO details automatically. Paste these into {plugin} in the WordPress
              editor.
            </p>
            <CopyRow label="SEO title" value={result.copyPanel.seoTitle} />
            <CopyRow label="Meta description" value={result.copyPanel.metaDescription} />
            <CopyRow label="Focus keyword" value={result.copyPanel.focusKeyword} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Export as a zip or folder; shows the files first. */
export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { content, site, flushSave } = useEditorCtx()
  const defaultFormat: ExportFormat = (EXPORT_FORMATS as readonly string[]).includes(site?.exportFormat ?? '')
    ? (site?.exportFormat as ExportFormat)
    : 'generic'
  const [format, setFormat] = useState<ExportFormat>(defaultFormat)
  const [folder, setFolder] = useState(false)
  const preview = useApi('content.exportPreview', open ? { id: content.id, format } : null)
  const { busy, run } = useAction()

  useEffect(() => {
    if (open) {
      setFormat(defaultFormat)
      void flushSave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const doExport = () =>
    run('export', async () => {
      await flushSave()
      const path = await api('content.export', { id: content.id, format, folder })
      if (!path) return
      toast({ kind: 'success', title: 'Exported', body: path })
      onOpenChange(false)
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>
            Everything you need to put this page on any website: HTML, Markdown, plain text, images, meta and
            schema, plus instructions.
          </DialogDescription>
        </DialogHeader>
        <Field
          label="Front-matter style"
          hint="Pick the one that matches your site builder. Generic works for Wix, Squarespace, Shopify and Webflow."
        >
          <Select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            {EXPORT_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f === 'nextjs-mdx' ? 'Next.js MDX' : f[0].toUpperCase() + f.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="export-kind" checked={!folder} onChange={() => setFolder(false)} />
            <FileArchive className="h-4 w-4" /> Zip file
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="export-kind" checked={folder} onChange={() => setFolder(true)} />
            <FolderOpen className="h-4 w-4" /> Folder
          </label>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Files</div>
          {preview.loading && !preview.data ? (
            <Loading label="Preparing…" />
          ) : (
            <>
              <ErrorText error={preview.error} />
              <ul className="max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-xs">
                {(preview.data ?? []).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={busy === 'export'} onClick={() => void doExport()}>
            {folder ? 'Choose folder and export' : 'Save zip'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Index status, "Request indexing in Search Console" and resubmit. */
export function IndexingSection({ messages }: { messages?: string[] }) {
  const { content } = useEditorCtx()
  const idx = useApi('content.indexing', { id: content.id })
  const { busy, run } = useAction()
  const [notes, setNotes] = useState<string[]>(messages ?? [])
  const i = idx.data

  useEffect(() => {
    if (messages) setNotes(messages)
  }, [messages])

  if (idx.loading && !i) return <Loading />
  if (idx.error) return <ErrorText error={idx.error} />
  if (!i) return null
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <span className="text-muted-foreground">Live address</span>
        {i.liveUrl ? (
          <button
            type="button"
            className="truncate text-left text-primary hover:underline"
            onClick={() => openExternal(i.liveUrl ?? '')}
          >
            {i.liveUrl}
          </button>
        ) : (
          <span>Not set</span>
        )}
        <span className="text-muted-foreground">Google status</span>
        <span>
          {i.indexStatus ??
            (i.gsc
              ? 'Not checked yet (the app checks about 3 days after publishing)'
              : 'Connect Google Search Console in Settings to see this')}
          {i.indexCheckedAt ? (
            <span className="text-muted-foreground"> · {formatDateTime(i.indexCheckedAt)}</span>
          ) : null}
        </span>
        <span className="text-muted-foreground">IndexNow</span>
        <span>{i.indexNow ? 'On (Bing and others are told about new pages)' : 'Off'}</span>
      </div>
      {notes.length > 0 && (
        <Callout kind="info">
          <ul className="list-disc space-y-0.5 pl-4">
            {notes.map((m, k) => (
              <li key={k}>{m}</li>
            ))}
          </ul>
        </Callout>
      )}
      <div className="flex flex-wrap gap-2">
        {i.inspectUrl && (
          <Button size="sm" onClick={() => openExternal(i.inspectUrl ?? '')}>
            <Search /> Request indexing in Search Console
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          loading={busy === 'resubmit'}
          disabled={!i.liveUrl}
          onClick={() =>
            void run('resubmit', async () => {
              setNotes(await api('content.resubmit', { id: content.id }))
              await idx.reload()
            })
          }
        >
          <Send /> Resubmit
        </Button>
      </div>
      {i.inspectUrl && (
        <p className="text-xs text-muted-foreground">
          In Search Console, click "Request indexing". Google only allows this by hand for normal pages.
        </p>
      )}
    </div>
  )
}

/** "Mark as published": ask for the live address, then show indexing help. */
export function PublishedDialog({
  open,
  onOpenChange,
  startWithStatus
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  startWithStatus: boolean
}) {
  const { content, checks, reload, setTab } = useEditorCtx()
  const linkBacks = checks.seoPass?.link_backs.length ?? 0
  const [url, setUrl] = useState('')
  const [messages, setMessages] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { busy, run } = useAction()

  useEffect(() => {
    if (!open) return
    setUrl(content.liveUrl ?? '')
    setMessages(startWithStatus ? [] : null)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = () =>
    run(
      'publish',
      async () => {
        setError(null)
        const r = await api('content.markPublished', { id: content.id, url })
        setMessages(r.indexing)
        await reload()
      },
      setError
    )

  const showStatus = messages !== null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{showStatus ? 'Getting indexed' : 'Mark as published'}</DialogTitle>
          <DialogDescription>
            {showStatus
              ? 'Help Google and Bing find your new page.'
              : 'Paste the address of the live page. The app then helps get it indexed and starts tracking its rankings.'}
          </DialogDescription>
        </DialogHeader>
        {showStatus ? (
          <>
            <IndexingSection messages={messages ?? undefined} />
            {linkBacks > 0 && (
              <Callout kind="info" title="Add links to your new page">
                {linkBacks} older page{linkBacks === 1 ? '' : 's'} should link here.{' '}
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    setTab('links')
                    onOpenChange(false)
                  }}
                >
                  See the list in the Links tab
                </button>
              </Callout>
            )}
          </>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <Field label="Live address">
              <Input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yoursite.com/your-page"
              />
            </Field>
            <ErrorText error={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy === 'publish'} disabled={!url.trim()}>
                Mark as published
              </Button>
            </DialogFooter>
          </form>
        )}
        {showStatus && content.status === 'Published' && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMessages(null)}>
              Change live address
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

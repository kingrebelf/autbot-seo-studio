import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Save, Check, AlertCircle, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { useTokenStream } from '@/hooks/useJobs'
import { useApp } from '@/lib/app-context'
import { errorMessage, cn } from '@/lib/utils'
import { Page } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Callout, EmptyState, ErrorText, Loading, ScoreRing } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { EditorProvider, type EditorCtx } from '@/components/editor/context'
import { useArticleEditor, EditorPane } from '@/components/editor/Editor'
import { Outline } from '@/components/editor/Outline'
import { RightPanel } from '@/components/editor/RightPanel'
import { BottomBar } from '@/components/editor/BottomBar'
import { JobBar } from '@/components/editor/JobBar'
import {
  readChecks,
  readResearch,
  isRightTab,
  type ContentView,
  type RightTab
} from '@/components/editor/types'

type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

/** Save a version snapshot with autosave at most this often (explicit saves always try). */
const VERSION_EVERY_MS = 10 * 60 * 1000
const AUTOSAVE_MS = 1500

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'outline'> = {
  Idea: 'outline',
  Researching: 'secondary',
  'Awaiting choice': 'warning',
  Writing: 'default',
  Checking: 'default',
  'Ready for review': 'warning',
  'Draft sent': 'success',
  Published: 'success',
  'Needs refresh': 'warning'
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'saving') return <span className="text-xs text-muted-foreground">Saving…</span>
  if (state === 'dirty') return <span className="text-xs text-muted-foreground">Unsaved changes</span>
  if (state === 'error')
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5" /> Not saved
      </span>
    )
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Check className="h-3.5 w-3.5" /> Saved
    </span>
  )
}

function RefreshBanner({ content }: { content: ContentView }) {
  const { improvements } = readResearch(content.research)
  return (
    <Callout
      kind="info"
      title="This is a refresh of an existing page"
      className="rounded-none border-x-0 border-t-0"
    >
      <p>
        Your original page{content.refreshOfUrl ? ` (${content.refreshOfUrl})` : ''} is never changed. This
        updated version is saved as a separate draft for you to review.
      </p>
      {improvements.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer font-medium">What changed ({improvements.length})</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {improvements.map((i, k) => (
              <li key={k}>
                {i.change}
                {i.why && <span className="text-muted-foreground"> — {i.why}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Callout>
  )
}

export default function ContentEditor() {
  const { id: idParam } = useParams()
  const id = Number(idParam)
  const valid = Number.isInteger(id) && id > 0
  const [params] = useSearchParams()
  const qTab = params.get('tab')
  const [tab, setTab] = useState<RightTab>(isRightTab(qTab) ? qTab : 'seo')
  useEffect(() => {
    if (isRightTab(qTab)) setTab(qTab)
  }, [qTab])

  const { sites } = useApp()
  const res = useApi('content.get', valid ? { id } : null, { refreshOnJobs: true })
  const { setData, reload } = res
  const content = res.data

  /* ------------------------------------------------ saving */
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const dirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const serverHtmlRef = useRef<string | null>(null)
  const lastUpdatedRef = useRef(0)
  const forceSyncRef = useRef(false)
  const lastVersionAtRef = useRef(0)
  const saveFnRef = useRef<(note?: string) => Promise<void>>(async () => undefined)

  const editor = useArticleEditor(() => {
    dirtyRef.current = true
    setSaveState('dirty')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void saveFnRef.current(), AUTOSAVE_MS)
  })

  const save = useCallback(
    (versionNote?: string): Promise<void> => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const step = async () => {
        if (!editor || !valid || !dirtyRef.current) return
        const html = editor.getHTML()
        dirtyRef.current = false
        setSaveState('saving')
        const note =
          versionNote ?? (Date.now() - lastVersionAtRef.current > VERSION_EVERY_MS ? 'Edited' : undefined)
        try {
          const r = await api('content.update', { id, patch: { bodyHtml: html }, versionNote: note })
          if (note) lastVersionAtRef.current = Date.now()
          serverHtmlRef.current = r.bodyHtml ?? ''
          lastUpdatedRef.current = Math.max(lastUpdatedRef.current, r.updatedAt)
          setData(r)
          setSaveState(dirtyRef.current ? 'dirty' : 'saved')
        } catch (e) {
          dirtyRef.current = true
          setSaveState('error')
          toast({ kind: 'error', title: "Your latest edits couldn't be saved", body: errorMessage(e) })
        }
      }
      chainRef.current = chainRef.current.then(step)
      return chainRef.current
    },
    [editor, id, valid, setData]
  )
  saveFnRef.current = save

  const flushSave = useCallback(() => save(), [save])

  // Save (with a version note) when leaving the screen.
  useEffect(
    () => () => {
      if (dirtyRef.current) void saveFnRef.current('Edited')
    },
    []
  )

  // Ctrl/Cmd+S saves now.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveFnRef.current('Edited')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* ------------------------------------------------ keep the editor in step with the server */
  useEffect(() => {
    if (!content || !editor) return
    const force = forceSyncRef.current
    if (!force && content.updatedAt < lastUpdatedRef.current) return // an older response arriving late
    lastUpdatedRef.current = Math.max(lastUpdatedRef.current, content.updatedAt)
    const html = content.bodyHtml ?? ''
    if (!force && html === serverHtmlRef.current) return
    if (!force && dirtyRef.current) return // don't wipe out what the user is typing
    forceSyncRef.current = false
    serverHtmlRef.current = html
    editor.commands.setContent(html, { emitUpdate: false })
  }, [content, editor])

  const applyContent = useCallback(
    (c: ContentView, opts?: { syncBody?: boolean }) => {
      if (opts?.syncBody) forceSyncRef.current = true
      setData(c)
    },
    [setData]
  )

  /* ------------------------------------------------ live writing */
  const writing = Boolean(content && content.status === 'Writing' && content.activeJob)
  const [stream, setStream] = useState('')
  const onChunk = useCallback((chunk: string) => setStream((s) => s + chunk), [])
  useTokenStream(writing ? id : null, onChunk)
  useEffect(() => setStream(''), [content?.bodyHtml, writing])

  useEffect(() => {
    if (editor && editor.isEditable === writing) editor.setEditable(!writing, false)
  }, [editor, writing])

  /* ------------------------------------------------ context */
  const checks = useMemo(() => readChecks(content?.checks), [content?.checks])
  const site = useMemo(
    () => (content ? (sites.find((s) => s.id === content.siteId) ?? null) : null),
    [sites, content]
  )
  const ctx: EditorCtx | null = useMemo(
    () => (content ? { content, checks, site, editor, applyContent, reload, flushSave, setTab } : null),
    [content, checks, site, editor, applyContent, reload, flushSave]
  )

  if (!valid)
    return (
      <Page>
        <EmptyState
          title="That piece of content wasn't found"
          action={<Link to="/content">Back to Content</Link>}
        />
      </Page>
    )
  if (!content || !ctx || !editor) {
    if (res.error)
      return (
        <Page>
          <BackLink />
          <div className="mt-4 space-y-3">
            <ErrorText error={res.error} />
            <Button variant="outline" onClick={() => void reload()}>
              <RefreshCw /> Try again
            </Button>
          </div>
        </Page>
      )
    return <Loading label="Opening the editor…" />
  }

  const early = ['Idea', 'Researching', 'Awaiting choice'].includes(content.status) && !content.bodyHtml
  const title = content.title || content.topic || 'Untitled'

  return (
    <EditorProvider value={ctx}>
      <div className="flex h-full min-h-0 flex-col" data-testid="content-editor">
        <header className="flex items-center gap-3 border-b px-4 py-2">
          <BackLink />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold" title={title}>
                {title}
              </h1>
              <Badge variant={STATUS_VARIANT[content.status] ?? 'outline'}>{content.status}</Badge>
              {content.mode === 'D' && <Badge variant="secondary">Refresh</Badge>}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {content.type}
              {content.focusKeyword && <> · Keyword: {content.focusKeyword}</>}
            </div>
          </div>
          <SaveIndicator state={saveState} />
          <Button
            size="sm"
            variant="outline"
            disabled={writing || saveState === 'saving'}
            onClick={() => void save('Edited')}
          >
            <Save /> Save
          </Button>
          <button
            type="button"
            title="SEO score: open the SEO tab"
            onClick={() => setTab('seo')}
            className="rounded-full"
          >
            <ScoreRing score={content.seoScore} size={40} />
          </button>
        </header>

        {content.activeJob && <JobBar job={content.activeJob} onChange={() => void reload()} />}
        {content.mode === 'D' && <RefreshBanner content={content} />}
        {early && (
          <Callout kind="info" className="rounded-none border-x-0 border-t-0">
            This piece is still being planned.{' '}
            <Link className="text-primary underline-offset-4 hover:underline" to={`/new/${content.id}`}>
              Continue in New Content
            </Link>{' '}
            to pick the keyword and write it.
          </Callout>
        )}

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-56 shrink-0 overflow-y-auto border-r bg-muted/20 lg:block">
            <Outline editor={editor} />
          </aside>
          <section className={cn('flex min-w-0 flex-1 flex-col')}>
            <EditorPane editor={editor} contentId={content.id} writing={writing} stream={stream} />
          </section>
          <aside className="w-[400px] shrink-0 border-l xl:w-[440px]">
            <RightPanel tab={tab} />
          </aside>
        </div>

        <BottomBar />
      </div>
    </EditorProvider>
  )
}

function BackLink() {
  return (
    <Link
      to="/content"
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> Back to Content
    </Link>
  )
}

import { useEffect, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { api, type RouteOutput } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { cn, errorMessage } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Callout, ErrorText, Loading } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'

type Template = RouteOutput<'prompts.list'>[number]

function Editor({ t, onChanged }: { t: Template; onChanged: () => Promise<void> }) {
  const [body, setBody] = useState(t.body)
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ask, confirmDialog] = useConfirm()
  useEffect(() => setBody(t.body), [t.body])
  const dirty = body !== t.body
  const missing = t.variables.filter((v) => !body.includes(`{{${v}}}`))

  const run = async (label: 'save' | 'reset', fn: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await fn()
      await onChanged()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{t.label}</h3>
        {t.isCustom && <Badge variant="warning">Custom</Badge>}
      </div>
      {t.variables.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Variables:</span>
          {t.variables.map((v) => (
            <button
              key={v}
              type="button"
              title="Copy"
              className="rounded-full border bg-muted px-2 py-0.5 font-mono text-xs hover:bg-accent"
              onClick={() => {
                void navigator.clipboard.writeText(`{{${v}}}`)
                toast({ kind: 'info', title: `Copied {{${v}}}` })
              }}
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      )}
      <Textarea
        aria-label={`${t.label} prompt`}
        className="min-h-[420px] font-mono text-xs leading-relaxed"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        spellCheck={false}
      />
      {missing.length > 0 && (
        <Callout kind="warning">
          This prompt no longer uses {missing.map((v) => `{{${v}}}`).join(', ')}. The AI won&apos;t see that
          information unless you put it back.
        </Callout>
      )}
      <ErrorText error={error} />
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            void run('save', async () => {
              if (!body.trim())
                throw new Error('The prompt is empty. Type something, or click "Reset to default".')
              await api('prompts.save', { key: t.key, body })
              toast({ kind: 'success', title: 'Prompt saved' })
            })
          }
          loading={busy === 'save'}
          disabled={!dirty || busy !== null}
        >
          <Save /> Save
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setBody(t.body)}>
            Undo changes
          </Button>
        )}
        {t.isCustom && (
          <Button
            variant="outline"
            onClick={() =>
              void (async () => {
                if (
                  await ask({
                    title: 'Reset this prompt to the default?',
                    body: 'Your custom version is deleted.',
                    confirm: 'Reset',
                    danger: true
                  })
                )
                  await run('reset', async () => {
                    await api('prompts.reset', { key: t.key })
                    toast({ kind: 'success', title: 'Prompt reset to default' })
                  })
              })()
            }
            loading={busy === 'reset'}
            disabled={busy !== null}
          >
            <RotateCcw /> Reset to default
          </Button>
        )}
      </div>
      {confirmDialog}
    </div>
  )
}

export function PromptsTab() {
  const list = useApi('prompts.list', undefined)
  const [key, setKey] = useState<string | null>(null)
  if (list.loading && !list.data) return <Loading />
  if (list.error) return <ErrorText error={`${list.error} Leave this tab and come back to try again.`} />
  const items = list.data ?? []
  const current = items.find((t) => t.key === key) ?? items[0]
  return (
    <div className="space-y-3">
      <Callout>
        These are the instructions the app gives the AI at each step. Edit them to change how it writes. Words
        in <code className="font-mono">{'{{double braces}}'}</code> are filled in automatically.
      </Callout>
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <nav className="space-y-0.5">
          {items.map((t) => (
            <button
              key={t.key}
              onClick={() => setKey(t.key)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent',
                current?.key === t.key && 'bg-primary/10 text-primary'
              )}
            >
              <span className="truncate">{t.label}</span>
              {t.isCustom && <span className="h-2 w-2 shrink-0 rounded-full bg-warning" title="Custom" />}
            </button>
          ))}
        </nav>
        <div>{current && <Editor key={current.key} t={current} onChanged={list.reload} />}</div>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Save, RefreshCw, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAction } from '@/hooks/useApi'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Callout } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { useEditorCtx } from '../context'
import { Section } from './Section'

function schemaTypes(v: unknown): string[] {
  const out = new Set<string>()
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk)
    else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>
      const t = o['@type']
      if (typeof t === 'string') out.add(t)
      else if (Array.isArray(t)) t.forEach((s) => typeof s === 'string' && out.add(s))
      if (o['@graph']) walk(o['@graph'])
      if (o.mainEntity) walk(o.mainEntity)
    }
  }
  walk(v)
  return [...out]
}

export function SchemaPanel() {
  const { content, applyContent, flushSave } = useEditorCtx()
  const { busy, run } = useAction()
  const serverText = useMemo(
    () => (content.schema == null ? '' : JSON.stringify(content.schema, null, 2)),
    [content.schema]
  )
  const [text, setText] = useState(serverText)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) setText(serverText)
  }, [serverText, dirty])

  const parsed = useMemo((): { ok: true; value: unknown } | { ok: false; error: string } => {
    if (!text.trim()) return { ok: true, value: null }
    try {
      return { ok: true, value: JSON.parse(text) as unknown }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Not valid JSON' }
    }
  }, [text])

  const save = () =>
    run('save', async () => {
      if (!parsed.ok) return
      applyContent(await api('content.update', { id: content.id, patch: { schema: parsed.value } }))
      setDirty(false)
      toast({ kind: 'success', title: 'Schema saved' })
    })

  const rebuild = () =>
    run('rebuild', async () => {
      await flushSave()
      applyContent(await api('content.fixCheck', { id: content.id, checkId: 'schema' }), { syncBody: true })
      setDirty(false)
      toast({ kind: 'success', title: 'Schema rebuilt from the article' })
    })

  const types = parsed.ok ? schemaTypes(parsed.value) : []

  return (
    <div className="space-y-3">
      <Section
        title="Structured data (JSON-LD)"
        hint="Helps search engines understand the page (article, FAQ, business, product…). Edit with care."
        actions={
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            loading={busy === 'rebuild'}
            disabled={busy !== null}
            onClick={() => void rebuild()}
          >
            <RefreshCw /> Rebuild
          </Button>
        }
      >
        <Textarea
          className="min-h-[420px] font-mono text-xs"
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setDirty(true)
          }}
          placeholder='{"@context": "https://schema.org", "@type": "Article", ...}'
        />
      </Section>
      {parsed.ok ? (
        types.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Valid JSON · {types.join(', ')}
          </div>
        )
      ) : (
        <Callout kind="error">This isn't valid JSON yet: {parsed.error}</Callout>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          loading={busy === 'save'}
          disabled={!dirty || !parsed.ok || busy !== null}
          onClick={() => void save()}
        >
          <Save /> Save schema
        </Button>
        {dirty && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setText(serverText)
              setDirty(false)
            }}
          >
            Discard changes
          </Button>
        )}
      </div>
    </div>
  )
}

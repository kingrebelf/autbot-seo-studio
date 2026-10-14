import { useState } from 'react'
import { KeyRound, LogIn, Plus, RefreshCw, Unplug, Zap } from 'lucide-react'
import { api, type RouteOutput } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { errorMessage } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { Callout, ErrorText, Loading } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { ExternalButton } from './shared'

export type ProviderMeta = RouteOutput<'providers.metas'>[number]
export type Connection = RouteOutput<'providers.list'>[number]

const LOCAL_HELP: Record<string, string> = {
  ollama:
    'Ollama isn\'t running. Install it from ollama.com, open it (or run "ollama serve"), pull a model such as "ollama pull llama3.1", then click Test.',
  lmstudio:
    'LM Studio\'s server isn\'t running. Open LM Studio, load a model, go to the Developer tab and click "Start Server". Then click Test.'
}

function StatusBadge({ conn }: { conn?: Connection }) {
  if (conn?.status === 'connected') return <Badge variant="success">Connected</Badge>
  if (conn?.status === 'error') return <Badge variant="destructive">Error</Badge>
  return <Badge variant="secondary">Not connected</Badge>
}

type Result = { ok: boolean; message: string; models: number }

function ProviderCard({
  meta,
  conn,
  onChanged,
  onCancelNew
}: {
  meta: ProviderMeta
  conn?: Connection
  onChanged: () => Promise<void> | void
  /** For a new custom endpoint that has not been saved yet. */
  onCancelNew?: () => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(conn?.baseUrl ?? meta.defaultBaseUrl ?? '')
  const [extra, setExtra] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const f of meta.extraFields ?? []) {
      const v = conn?.extra[f.key]
      out[f.key] = typeof v === 'string' ? v : ''
    }
    return out
  })
  const [busy, setBusy] = useState<'test' | 'refresh' | 'disconnect' | 'signin' | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ask, confirmDialog] = useConfirm()

  const isPlan = meta.authKind === 'oauth'
  const extraDirty = (meta.extraFields ?? []).some((f) => (conn?.extra[f.key] ?? '') !== extra[f.key])
  const dirty =
    !conn || apiKey.trim() !== '' || (meta.baseUrlEditable && baseUrl !== (conn.baseUrl ?? '')) || extraDirty

  const finish = async (r: Result) => {
    setResult(r)
    if (r.ok) {
      setApiKey('')
      toast({
        kind: 'success',
        title: `${conn?.displayName ?? meta.displayName} connected`,
        body: `Found ${r.models} model${r.models === 1 ? '' : 's'}.`
      })
    }
    await onChanged()
  }

  const test = async () => {
    setBusy('test')
    setError(null)
    setResult(null)
    try {
      if (dirty) {
        if (meta.authKind === 'apiKey' && !meta.keyOptional && !conn?.hasKey && !apiKey.trim()) {
          setError('Paste your API key first. Use "Get a key" if you don\'t have one yet.')
          return
        }
        const cleanedExtra: Record<string, string> = {}
        for (const [k, v] of Object.entries(extra)) if (v.trim()) cleanedExtra[k] = v.trim()
        const r = await api('providers.save', {
          type: meta.id,
          connectionId: conn?.id,
          apiKey: apiKey.trim() || undefined,
          baseUrl: meta.baseUrlEditable ? baseUrl.trim() || undefined : undefined,
          extra: Object.keys(cleanedExtra).length ? cleanedExtra : undefined
        })
        await finish(r)
        if (!conn && onCancelNew) onCancelNew()
      } else if (conn) {
        await finish(await api('providers.test', { id: conn.id }))
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const signIn = async () => {
    setBusy('signin')
    setError(null)
    setResult(null)
    try {
      await finish(await api('providers.signInChatGPT'))
    } catch (e) {
      setError(errorMessage(e))
      await onChanged()
    } finally {
      setBusy(null)
    }
  }

  const refresh = async () => {
    if (!conn) return
    setBusy('refresh')
    setError(null)
    try {
      const n = await api('providers.refreshModels', { id: conn.id })
      toast({
        kind: 'success',
        title: `Models refreshed`,
        body: `${n} model${n === 1 ? '' : 's'} available.`
      })
      await onChanged()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    if (!conn) return
    const ok = await ask({
      title: `Disconnect ${conn.displayName}?`,
      body: 'The saved key or sign-in is removed from this computer. Tasks that used its models will be switched to other connected models.',
      confirm: 'Disconnect',
      danger: true
    })
    if (!ok) return
    setBusy('disconnect')
    setError(null)
    try {
      await api('providers.disconnect', { id: conn.id })
      setResult(null)
      await onChanged()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const failed = result && !result.ok ? result.message : conn?.status === 'error' ? conn.statusMessage : null
  const connected = conn?.status === 'connected'
  const email = typeof conn?.extra.email === 'string' ? conn.extra.email : ''

  return (
    <Card data-testid={`provider-${meta.id}`} className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{conn?.displayName ?? meta.displayName}</CardTitle>
          <StatusBadge conn={conn} />
        </div>
        <CardDescription>{meta.blurb}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {isPlan ? (
          <>
            <p className="text-sm text-muted-foreground">
              Sign in with your ChatGPT Plus or Pro account in your browser. Everything this app does counts
              against your plan&apos;s usage limits, just like using ChatGPT. When the limit is used up, tasks
              pause until it resets or you switch them to another model.
            </p>
            {connected && email && <p className="text-sm">Signed in as {email}</p>}
          </>
        ) : (
          <>
            {meta.authKind === 'apiKey' && (
              <Field
                label={meta.keyOptional ? 'API key (optional)' : 'API key'}
                hint={conn?.hasKey ? 'Key saved. Paste a new one only to replace it.' : undefined}
              >
                <Input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={conn?.hasKey ? '•••••••• Key saved' : 'Paste your key'}
                />
              </Field>
            )}
            {meta.baseUrlEditable && (
              <Field label="Address (base URL)">
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={meta.defaultBaseUrl ?? 'https://api.example.com/v1'}
                />
              </Field>
            )}
            {(meta.extraFields ?? []).map((f) => (
              <Field key={f.key} label={f.label}>
                <Input
                  value={extra[f.key] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => setExtra({ ...extra, [f.key]: e.target.value })}
                />
              </Field>
            ))}
          </>
        )}
        {result?.ok && (
          <Callout kind="success">
            {result.message} Found {result.models} model{result.models === 1 ? '' : 's'}.
          </Callout>
        )}
        {failed && (
          <Callout kind="error">
            {failed}
            {meta.local && LOCAL_HELP[meta.id] && <p className="mt-1">{LOCAL_HELP[meta.id]}</p>}
            {isPlan && <p className="mt-1">You can connect the OpenAI (API key) card instead.</p>}
          </Callout>
        )}
        <ErrorText error={error} />
        {meta.local && !connected && !failed && (
          <p className="text-xs text-muted-foreground">
            Free and private. Local models may be slower and less accurate than the big online ones.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex-wrap">
        {isPlan ? (
          <Button
            size="sm"
            onClick={() => void signIn()}
            loading={busy === 'signin'}
            disabled={busy !== null}
          >
            <LogIn /> {connected ? 'Sign in again' : 'Sign in with ChatGPT'}
          </Button>
        ) : (
          <Button size="sm" onClick={() => void test()} loading={busy === 'test'} disabled={busy !== null}>
            <Zap /> {dirty ? 'Save & test' : 'Test'}
          </Button>
        )}
        {connected && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refresh()}
            loading={busy === 'refresh'}
            disabled={busy !== null}
          >
            <RefreshCw /> Refresh models
          </Button>
        )}
        {conn && conn.status !== 'disconnected' && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void disconnect()}
            loading={busy === 'disconnect'}
            disabled={busy !== null}
          >
            <Unplug /> Disconnect
          </Button>
        )}
        {!conn && onCancelNew && (
          <Button size="sm" variant="ghost" onClick={onCancelNew}>
            Cancel
          </Button>
        )}
        <div className="ml-auto flex gap-3">
          {meta.keyUrl && (
            <ExternalButton url={meta.keyUrl}>
              {meta.local ? (
                'Download'
              ) : (
                <>
                  <KeyRound className="h-4 w-4" /> Get a key
                </>
              )}
            </ExternalButton>
          )}
          {meta.docsUrl && <ExternalButton url={meta.docsUrl}>Docs</ExternalButton>}
        </div>
      </CardFooter>
      {confirmDialog}
    </Card>
  )
}

/** Every provider card, merged with the saved connections. Used in Settings and the setup wizard. */
export function ProviderCards({ onChange }: { onChange?: () => void }) {
  const metas = useApi('providers.metas', undefined)
  const conns = useApi('providers.list', undefined)
  const [newCustom, setNewCustom] = useState(0)

  if (metas.loading && !metas.data) return <Loading label="Loading AI providers…" />
  if (metas.error) return <ErrorText error={`${metas.error} Restart the app if this keeps happening.`} />

  const list = conns.data ?? []
  const changed = async () => {
    await conns.reload()
    onChange?.()
  }

  const ordered = [...(metas.data ?? [])].sort(
    (a, b) => Number(b.authKind === 'oauth') - Number(a.authKind === 'oauth')
  )
  const cards: React.ReactNode[] = []
  for (const meta of ordered) {
    if (meta.multi) {
      for (const c of list.filter((x) => x.type === meta.id))
        cards.push(<ProviderCard key={c.id} meta={meta} conn={c} onChanged={changed} />)
      if (newCustom > 0)
        cards.push(
          <ProviderCard
            key={`new-${newCustom}`}
            meta={meta}
            onChanged={changed}
            onCancelNew={() => setNewCustom(0)}
          />
        )
    } else {
      const c = list.find((x) => x.id === meta.id)
      cards.push(<ProviderCard key={meta.id} meta={meta} conn={c} onChanged={changed} />)
    }
  }
  const customMeta = ordered.find((m) => m.multi)

  return (
    <div className="space-y-3">
      {conns.error && (
        <Callout kind="error">
          {conns.error}{' '}
          <Button size="sm" variant="link" className="h-auto px-0" onClick={() => void conns.reload()}>
            Try again
          </Button>
        </Callout>
      )}
      <div className="grid gap-4 lg:grid-cols-2">{cards}</div>
      {customMeta && newCustom === 0 && (
        <Button variant="outline" onClick={() => setNewCustom(Date.now())}>
          <Plus /> Add a custom OpenAI-compatible endpoint
        </Button>
      )}
    </div>
  )
}

/** Count of connected providers, for the wizard. */
export function useConnectedCount(): { count: number; reload: () => Promise<void> } {
  const conns = useApi('providers.list', undefined)
  return { count: (conns.data ?? []).filter((c) => c.status === 'connected').length, reload: conns.reload }
}

import { useState } from 'react'
import { Trash2, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { useApp } from '@/lib/app-context'
import { errorMessage } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Callout, ErrorText, Loading } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { ExternalButton, SwitchRow } from './shared'

type Kind = 'dataforseo' | 'serper' | 'brave' | 'bing'

function SourceCard({
  kind,
  title,
  adds,
  cost,
  connected,
  login,
  keyUrl,
  secretLabel,
  onChanged
}: {
  kind: Kind
  title: string
  adds: string
  cost: string
  connected: boolean
  login?: string
  keyUrl: string
  secretLabel: string
  onChanged: () => Promise<void>
}) {
  const [loginValue, setLogin] = useState(login ?? '')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const saveIt = async () => {
    setBusy('save')
    setError(null)
    setResult(null)
    try {
      if (kind === 'dataforseo' && !loginValue.trim())
        throw new Error('Enter your DataForSEO login (the email you signed up with).')
      if (!secret.trim()) throw new Error(`Paste your ${secretLabel.toLowerCase()} first.`)
      const r = await api('ds.save', {
        kind,
        login: kind === 'dataforseo' ? loginValue.trim() : undefined,
        secret: secret.trim()
      })
      setResult(r)
      if (r.ok) setSecret('')
      await onChanged()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy('remove')
    setError(null)
    try {
      await api('ds.remove', { kind })
      setResult(null)
      toast({ kind: 'success', title: `${title} removed` })
      await onChanged()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {connected ? (
            <Badge variant="success">Connected</Badge>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )}
        </div>
        <CardDescription>
          {adds} <span className="whitespace-nowrap">({cost})</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {kind === 'dataforseo' && (
          <Field label="Login (email)">
            <Input value={loginValue} onChange={(e) => setLogin(e.target.value)} autoComplete="off" />
          </Field>
        )}
        <Field
          label={secretLabel}
          hint={connected ? 'Saved. Paste a new one only to replace it.' : undefined}
        >
          <Input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="off"
            placeholder={connected ? '•••• saved' : ''}
          />
        </Field>
        {result && (
          <Callout kind={result.ok ? 'success' : 'error'}>
            {result.message}
            {!result.ok && ' Check the details, then click Save & test again.'}
          </Callout>
        )}
        <ErrorText error={error} />
      </CardContent>
      <CardFooter className="flex-wrap">
        <Button size="sm" onClick={() => void saveIt()} loading={busy === 'save'} disabled={busy !== null}>
          <Zap /> Save &amp; test
        </Button>
        {connected && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void remove()}
            loading={busy === 'remove'}
            disabled={busy !== null}
          >
            <Trash2 /> Remove
          </Button>
        )}
        <div className="ml-auto">
          <ExternalButton url={keyUrl}>Get a key</ExternalButton>
        </div>
      </CardFooter>
    </Card>
  )
}

function NumberSetting({
  label,
  hint,
  value,
  min,
  max,
  onSave
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  onSave: (n: number) => Promise<void>
}) {
  const [v, setV] = useState(String(value))
  const [error, setError] = useState<string | null>(null)
  const commit = async () => {
    const n = Math.round(Number(v))
    if (!Number.isFinite(n) || n < min || n > max) {
      setError(`Type a number from ${min} to ${max}.`)
      return
    }
    setError(null)
    if (n !== value) {
      try {
        await onSave(n)
        toast({ kind: 'success', title: `${label} saved` })
      } catch (e) {
        setError(errorMessage(e))
      }
    }
  }
  return (
    <Field label={label} hint={hint}>
      <Input
        className="max-w-[10rem]"
        inputMode="numeric"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => e.key === 'Enter' && void commit()}
      />
      <ErrorText error={error} />
    </Field>
  )
}

export function DataSourcesTab() {
  const ds = useApi('ds.status', undefined)
  const { settings, setSetting } = useApp()

  if (ds.loading && !ds.data) return <Loading />
  if (ds.error || !ds.data)
    return (
      <ErrorText
        error={`${ds.error ?? 'Could not load data sources.'} Leave this tab and come back to try again.`}
      />
    )
  const d = ds.data

  return (
    <div className="space-y-6">
      <Callout>
        The app works with only an AI connected. Each source below is optional and makes research better.
        Numbers always show where they came from; without a data source, search volume shows as
        &ldquo;unknown&rdquo;.
      </Callout>
      <div className="grid gap-4 lg:grid-cols-2">
        <SourceCard
          kind="dataforseo"
          title="DataForSEO"
          adds="Search volume, keyword difficulty, search results and rank checks."
          cost="pay-as-you-go"
          connected={d.dataforseo.connected}
          login={d.dataforseo.login}
          keyUrl="https://app.dataforseo.com/api-access"
          secretLabel="API password"
          onChanged={ds.reload}
        />
        <SourceCard
          kind="serper"
          title="Serper.dev"
          adds="The top 10 Google results for a search, to see who you compete with."
          cost="free tier"
          connected={d.serper}
          keyUrl="https://serper.dev/api-key"
          secretLabel="API key"
          onChanged={ds.reload}
        />
        <SourceCard
          kind="brave"
          title="Brave Search API"
          adds="Top 10 results for a search (an alternative to Serper)."
          cost="free tier"
          connected={d.brave}
          keyUrl="https://api-dashboard.search.brave.com/app/keys"
          secretLabel="API key"
          onChanged={ds.reload}
        />
        <SourceCard
          kind="bing"
          title="Bing Webmaster Tools"
          adds="Searches you appear for on Bing."
          cost="free"
          connected={d.bing}
          keyUrl="https://www.bing.com/webmasters/settings/api"
          secretLabel="API key"
          onChanged={ds.reload}
        />
      </div>
      {d.serper && d.brave && (
        <p className="text-sm text-muted-foreground">
          Both Serper and Brave are connected. The app uses {d.serpProvider === 'brave' ? 'Brave' : 'Serper'}{' '}
          (the one saved last).
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Free sources and limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SwitchRow
            label="Google Autocomplete suggestions"
            hint="Real phrases people type into Google. Free. The app asks at most once per second."
          >
            <Switch
              checked={settings?.autocompleteEnabled ?? true}
              onCheckedChange={(v) => void setSetting('autocompleteEnabled', v).then(ds.reload)}
            />
          </SwitchRow>
          <div className="grid gap-4 md:grid-cols-2">
            <NumberSetting
              label="Most pages to read per site"
              hint="The crawler reads your sitemap first, one page per second."
              value={settings?.crawlMaxPages ?? 500}
              min={10}
              max={10000}
              onSave={(n) => setSetting('crawlMaxPages', n)}
            />
            <NumberSetting
              label="Jobs at the same time"
              hint="How many background jobs run at once. Lower it if your AI provider complains about too many requests."
              value={settings?.jobConcurrency ?? 2}
              min={1}
              max={8}
              onSave={(n) => setSetting('jobConcurrency', n)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

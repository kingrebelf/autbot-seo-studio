import { useEffect, useState } from 'react'
import { CheckCircle2, Download, RefreshCw, Unplug, XCircle, Zap } from 'lucide-react'
import { api, type RouteOutput } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { useApp } from '@/lib/app-context'
import { errorMessage } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Callout, ErrorText, Loading } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { ExternalButton, docLink } from './shared'

type TestResult = RouteOutput<'wp.test'>

export const SEO_PLUGIN_NAMES: Record<string, string> = {
  yoast: 'Yoast SEO',
  rankmath: 'Rank Math',
  aioseo: 'All in One SEO'
}

function Can({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : XCircle
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className={ok ? 'h-4 w-4 text-success' : 'h-4 w-4 text-destructive'} /> {children}
    </span>
  )
}

function ResultPanel({ r }: { r: TestResult }) {
  return (
    <Callout kind="success" title={`Connected as ${r.name}`}>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        <span>Role: {r.roles.length ? r.roles.join(', ') : 'unknown'}</span>
        <Can ok={r.canPosts}>Can create posts</Can>
        <Can ok={r.canPages}>Can create pages</Can>
        <span>SEO plugin: {r.seoPlugin ? (SEO_PLUGIN_NAMES[r.seoPlugin] ?? r.seoPlugin) : 'none found'}</span>
      </div>
      {!r.canPages && (
        <p className="mt-1">To send pages (not just posts), give this WordPress user the Editor role.</p>
      )}
      {r.viaRestRoute && (
        <p className="mt-1">
          Your site blocks the normal REST address, so the app is using the ?rest_route= fallback. That works
          fine.
        </p>
      )}
    </Callout>
  )
}

function HelpPanel() {
  return (
    <details className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">How do I get an application password?</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>
          In WordPress, create a separate user for the app (for example &ldquo;autbot-writer&rdquo;). Give it
          the <strong>Author</strong> role for posts only, or <strong>Editor</strong> if it should create
          pages too.
        </li>
        <li>Open that user&apos;s profile and scroll to &ldquo;Application Passwords&rdquo;.</li>
        <li>
          Type the name &ldquo;Autbot SEO Studio&rdquo; and click &ldquo;Add New Application Password&rdquo;.
        </li>
        <li>Copy the password it shows and paste it here, with that user&apos;s username.</li>
      </ol>
      <p className="mt-2 text-muted-foreground">
        Your site must use HTTPS. Some hosts or security plugins turn application passwords off; if so, turn
        them back on in that plugin or ask your host.
      </p>
      <div className="mt-2">
        <ExternalButton url={docLink('CONNECT-WORDPRESS.md')}>
          Step-by-step guide with pictures
        </ExternalButton>
      </div>
    </details>
  )
}

/** Connect the active (or given) site to WordPress. Used in Settings > Publishing and the setup wizard. */
export function WordPressConnect({ siteId, onConnected }: { siteId: number; onConnected?: () => void }) {
  const { reloadSites } = useApp()
  const status = useApi('wp.status', { siteId })
  const [url, setUrl] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [result, setResult] = useState<TestResult | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ask, confirmDialog] = useConfirm()

  useEffect(() => {
    if (status.data) {
      setUrl(status.data.url ?? '')
      setUser(status.data.user ?? '')
    }
  }, [status.data])

  useEffect(() => {
    setResult(null)
    setError(null)
    setPassword('')
  }, [siteId])

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const connect = () =>
    run('save', async () => {
      if (!url.trim()) throw new Error('Enter your WordPress site address, like https://www.example.com.')
      if (!user.trim()) throw new Error('Enter the WordPress username the app should use.')
      if (!password.trim() && !status.data?.connected)
        throw new Error(
          'Paste the application password from WordPress. See "How do I get an application password?" below.'
        )
      const r = await api('wp.save', {
        siteId,
        url: url.trim(),
        user: user.trim(),
        password: password.trim() || undefined
      })
      setResult(r)
      setPassword('')
      await Promise.all([status.reload(), reloadSites()])
      toast({
        kind: 'success',
        title: 'WordPress connected',
        body: 'Reading your existing posts and pages in the background.'
      })
      onConnected?.()
    })

  const test = () =>
    run('test', async () => {
      setResult(await api('wp.test', { siteId }))
    })

  const disconnect = async () => {
    if (
      !(await ask({
        title: 'Disconnect WordPress?',
        body: 'The saved application password is removed from this computer. Drafts already in WordPress stay there.',
        confirm: 'Disconnect',
        danger: true
      }))
    )
      return
    await run('disconnect', async () => {
      await api('wp.disconnect', { siteId })
      setResult(null)
      await Promise.all([status.reload(), reloadSites()])
    })
  }

  if (status.loading && !status.data) return <Loading label="Checking WordPress connection…" />
  const s = status.data
  const connected = Boolean(s?.connected)

  return (
    <div className="space-y-4" data-testid="wordpress-connect">
      <div className="flex flex-wrap items-center gap-2">
        {connected ? (
          <Badge variant="success">Connected</Badge>
        ) : (
          <Badge variant="secondary">Not connected</Badge>
        )}
        {connected && s?.seoPlugin && (
          <Badge variant="outline">SEO plugin: {SEO_PLUGIN_NAMES[s.seoPlugin] ?? s.seoPlugin}</Badge>
        )}
        {connected && s && !s.seoPlugin && <Badge variant="outline">No SEO plugin found</Badge>}
      </div>
      <Callout>The app only ever creates drafts. You publish from WordPress.</Callout>
      {status.error && <ErrorText error={status.error} />}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="WordPress site address">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.example.com" />
        </Field>
        <Field label="Username">
          <Input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="autbot-writer"
            autoComplete="off"
          />
        </Field>
        <Field
          label="Application password"
          hint={connected ? 'Password saved. Paste a new one only to replace it.' : undefined}
        >
          <Input
            type="password"
            value={password}
            autoComplete="off"
            onChange={(e) => setPassword(e.target.value)}
            placeholder={connected ? '•••• saved' : 'xxxx xxxx xxxx xxxx xxxx xxxx'}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void connect()} loading={busy === 'save'} disabled={busy !== null}>
          <Zap /> {connected ? 'Save & test' : 'Connect'}
        </Button>
        {connected && (
          <>
            <Button
              variant="outline"
              onClick={() => void test()}
              loading={busy === 'test'}
              disabled={busy !== null}
            >
              Test connection
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void run('import', async () => {
                  await api('wp.import', { siteId })
                  toast({
                    kind: 'info',
                    title: 'Reading your posts and pages again',
                    body: 'Watch progress in Activity.'
                  })
                })
              }
              loading={busy === 'import'}
              disabled={busy !== null}
            >
              <Download /> Read posts again
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void run('sync', async () => {
                  await api('wp.sync', { siteId })
                  toast({
                    kind: 'info',
                    title: 'Checking which drafts were published',
                    body: 'Watch progress in Activity.'
                  })
                })
              }
              loading={busy === 'sync'}
              disabled={busy !== null}
            >
              <RefreshCw /> Check status
            </Button>
            <Button
              variant="ghost"
              onClick={() => void disconnect()}
              loading={busy === 'disconnect'}
              disabled={busy !== null}
            >
              <Unplug /> Disconnect
            </Button>
          </>
        )}
      </div>
      <ErrorText error={error} />
      {result && <ResultPanel r={result} />}
      {connected && s?.canWrite && !result && (
        <p className="text-sm text-muted-foreground">
          Last test: {s.canWrite.posts ? 'can create posts' : 'cannot create posts'},{' '}
          {s.canWrite.pages ? 'can create pages' : 'cannot create pages'}.
        </p>
      )}
      <HelpPanel />
      {confirmDialog}
    </div>
  )
}

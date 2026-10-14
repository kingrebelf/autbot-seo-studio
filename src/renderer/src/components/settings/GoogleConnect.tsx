import { useState } from 'react'
import { CloudDownload, LogIn, Unplug, Wand2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { useApp } from '@/lib/app-context'
import { errorMessage } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { Callout, ErrorText, Loading, Spinner } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { ExternalButton, docLink, settingsOf } from './shared'

function PropertyPicker({ siteId }: { siteId: number }) {
  const { sites, reloadSites } = useApp()
  const site = sites.find((s) => s.id === siteId)
  const props = useApi('google.properties', undefined)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = site ? (settingsOf(site).gscProperty ?? '') : ''

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

  if (!site) return null
  if (props.loading && !props.data) return <Loading label="Loading your Search Console properties…" />
  const list = props.data ?? []

  return (
    <div className="space-y-2">
      <Field
        label={`Search Console property for ${site.name}`}
        hint="Pick the property that matches this website. A Domain property (sc-domain:) covers every version of the site."
      >
        <div className="flex flex-wrap gap-2">
          <Select
            className="max-w-md"
            value={current}
            disabled={busy !== null || list.length === 0}
            onChange={(e) =>
              void run('set', async () => {
                await api('google.setProperty', { siteId, property: e.target.value })
                await reloadSites()
                toast({
                  kind: 'success',
                  title: 'Property saved',
                  body: 'Pulling Search Console data in the background.'
                })
              })
            }
          >
            <option value="" disabled>
              {list.length ? 'Pick a property' : 'No properties found'}
            </option>
            {current && !list.some((p) => p.siteUrl === current) && (
              <option value={current}>{current}</option>
            )}
            {list.map((p) => (
              <option key={p.siteUrl} value={p.siteUrl}>
                {p.siteUrl}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            onClick={() =>
              void run('auto', async () => {
                const p = await api('google.autoProperty', { siteId })
                await reloadSites()
                if (p) toast({ kind: 'success', title: `Matched ${p}` })
                else
                  setError(
                    "Couldn't find a property that matches this website. Pick one from the list, or add the site in Search Console first."
                  )
              })
            }
            loading={busy === 'auto'}
            disabled={busy !== null}
          >
            <Wand2 /> Find it for me
          </Button>
          {current && (
            <Button
              variant="outline"
              onClick={() =>
                void run('pull', async () => {
                  await api('google.pull', { siteId })
                  toast({
                    kind: 'info',
                    title: 'Pulling Search Console data',
                    body: 'Watch progress in Activity.'
                  })
                })
              }
              loading={busy === 'pull'}
              disabled={busy !== null}
            >
              <CloudDownload /> Pull data now
            </Button>
          )}
        </div>
      </Field>
      {props.error && <ErrorText error={props.error} />}
      {!props.error && list.length === 0 && (
        <Callout kind="warning">
          This Google account has no verified Search Console properties. Add and verify your site at
          search.google.com/search-console, then come back and click &ldquo;Find it for me&rdquo;.
        </Callout>
      )}
      <ErrorText error={error} />
    </div>
  )
}

/** Google Search Console: OAuth client, connect/disconnect, property per site. Settings > Google and wizard step 5. */
export function GoogleConnect({ siteId, onConnected }: { siteId: number | null; onConnected?: () => void }) {
  const status = useApi('google.status', undefined)
  const { reloadSites } = useApp()
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ask, confirmDialog] = useConfirm()

  if (status.loading && !status.data) return <Loading label="Checking Google connection…" />
  const s = status.data
  const idValue = clientId ?? s?.clientId ?? ''
  const clientDirty = (clientId !== null && clientId !== s?.clientId) || clientSecret.trim() !== ''

  const saveClient = async () => {
    await api('google.setClient', {
      clientId: idValue.trim(),
      clientSecret: clientSecret.trim() || undefined
    })
    setClientSecret('')
    setClientId(null)
  }

  const connect = async () => {
    setBusy('connect')
    setError(null)
    try {
      if (!idValue.trim())
        throw new Error('Paste your Google OAuth client ID first. The guide below shows how to make one.')
      if (clientDirty) await saveClient()
      await api('google.connect')
      if (siteId) {
        try {
          await api('google.autoProperty', { siteId })
        } catch {
          /* the picker below lets the user choose */
        }
      }
      await Promise.all([status.reload(), reloadSites()])
      toast({ kind: 'success', title: 'Search Console connected' })
      onConnected?.()
    } catch (e) {
      setError(errorMessage(e))
      await status.reload()
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    if (
      !(await ask({
        title: 'Disconnect Google?',
        body: 'The app stops reading Search Console data. Data already pulled stays in the app.',
        confirm: 'Disconnect',
        danger: true
      }))
    )
      return
    setBusy('disconnect')
    setError(null)
    try {
      await api('google.disconnect')
      await status.reload()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4" data-testid="google-connect">
      <div className="flex items-center gap-2">
        {s?.connected ? (
          <Badge variant="success">Connected</Badge>
        ) : (
          <Badge variant="secondary">Not connected</Badge>
        )}
      </div>
      {status.error && <ErrorText error={status.error} />}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="OAuth client ID" hint="From Google Cloud Console. Use a “Desktop app” client.">
          <Input
            value={idValue}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="1234567890-abc.apps.googleusercontent.com"
            autoComplete="off"
          />
        </Field>
        <Field
          label="Client secret"
          hint={
            s?.hasClientSecret
              ? 'Secret saved. Paste a new one only to replace it.'
              : 'Google shows it next to the client ID.'
          }
        >
          <Input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={s?.hasClientSecret ? '•••• saved' : 'GOCSPX-…'}
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {clientDirty && (
          <Button
            variant="outline"
            onClick={() =>
              void (async () => {
                setBusy('client')
                setError(null)
                try {
                  await saveClient()
                  await status.reload()
                  toast({ kind: 'success', title: 'Google client saved' })
                } catch (e) {
                  setError(errorMessage(e))
                } finally {
                  setBusy(null)
                }
              })()
            }
            loading={busy === 'client'}
            disabled={busy !== null}
          >
            Save client
          </Button>
        )}
        <Button onClick={() => void connect()} disabled={busy !== null}>
          <LogIn /> {s?.connected ? 'Connect again' : 'Connect Google'}
        </Button>
        {s?.connected && (
          <Button
            variant="ghost"
            onClick={() => void disconnect()}
            loading={busy === 'disconnect'}
            disabled={busy !== null}
          >
            <Unplug /> Disconnect
          </Button>
        )}
        <ExternalButton url={docLink('CONNECT-GOOGLE.md')}>How to get a client ID (5 minutes)</ExternalButton>
      </div>
      {busy === 'connect' && (
        <Callout>
          <span className="inline-flex items-center gap-2">
            <Spinner /> Finish signing in in your browser. This screen updates when you&apos;re done.
          </span>
        </Callout>
      )}
      <ErrorText error={error} />
      {s?.connected && siteId && <PropertyPicker siteId={siteId} />}
      {confirmDialog}
    </div>
  )
}

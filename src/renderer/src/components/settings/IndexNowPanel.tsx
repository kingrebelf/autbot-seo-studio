import { useState } from 'react'
import { FileDown, KeyRound, Send } from 'lucide-react'
import { api } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { useApp } from '@/lib/app-context'
import { errorMessage } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Callout, ErrorText, Loading } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { SwitchRow } from './shared'

/** IndexNow (Bing, Yandex and others) for one site. */
export function IndexNowPanel({ siteId }: { siteId: number }) {
  const info = useApi('indexnow.info', { siteId })
  const { reloadSites } = useApp()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

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

  if (info.loading && !info.data) return <Loading />
  const d = info.data

  return (
    <div className="space-y-3" data-testid="indexnow">
      <SwitchRow
        label="Tell Bing and others about new pages (IndexNow)"
        hint="When a piece is published, the app pings IndexNow so Bing, Yandex and other search engines find it fast."
      >
        <Switch
          checked={d?.enabled ?? true}
          disabled={busy !== null}
          onCheckedChange={(v) =>
            void run('toggle', async () => {
              await api('sites.update', { siteId, settings: { indexNowEnabled: v } })
              await Promise.all([info.reload(), reloadSites()])
            })
          }
        />
      </SwitchRow>
      {info.error && <ErrorText error={info.error} />}
      {d?.key ? (
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <div>
            Key file name: <code className="rounded bg-muted px-1">{d.fileName}</code>
          </div>
          <div>
            Upload it so it opens at: <code className="break-all rounded bg-muted px-1">{d.location}</code>
          </div>
          <p className="text-muted-foreground">
            WordPress: upload the file to your site&apos;s main folder with your host&apos;s file manager, or
            install the free IndexNow plugin instead. Exported sites: the key file is included in every
            export; put it in the site&apos;s root folder.
          </p>
        </div>
      ) : (
        <Callout>Generate a key to turn IndexNow on. It takes one click.</Callout>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={d?.key ? 'outline' : 'default'}
          onClick={() =>
            void run('gen', async () => {
              await api('indexnow.generate', { siteId })
              setTestResult(null)
              await Promise.all([info.reload(), reloadSites()])
            })
          }
          loading={busy === 'gen'}
          disabled={busy !== null}
        >
          <KeyRound /> {d?.key ? 'Make a new key' : 'Generate key'}
        </Button>
        {d?.key && (
          <>
            <Button
              variant="outline"
              onClick={() =>
                void run('file', async () => {
                  const p = await api('indexnow.saveKeyFile', { siteId })
                  if (p) toast({ kind: 'success', title: 'Key file saved', body: p })
                })
              }
              loading={busy === 'file'}
              disabled={busy !== null}
            >
              <FileDown /> Save key file
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void run('test', async () => {
                  setTestResult(await api('indexnow.test', { siteId }))
                })
              }
              loading={busy === 'test'}
              disabled={busy !== null}
            >
              <Send /> Test
            </Button>
          </>
        )}
      </div>
      {testResult && (
        <Callout kind={testResult.ok ? 'success' : 'error'}>
          {testResult.message}
          {!testResult.ok && ' Check the key file opens at the address above, then test again.'}
        </Callout>
      )}
      <ErrorText error={error} />
    </div>
  )
}

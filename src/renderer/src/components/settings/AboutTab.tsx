import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArchiveRestore, Download, FileText, FolderOpen, RefreshCw, Save, Wand2 } from 'lucide-react'
import { api, type RouteOutput } from '@/lib/api'
import { useApp } from '@/lib/app-context'
import { errorMessage } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Callout } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'
import { APP_NAME, DOCS_URL, ISSUES_URL } from '@shared/constants'
import { ExternalButton, openLink } from './shared'

type Update = RouteOutput<'app.checkUpdates'>

export function AboutTab() {
  const { info } = useApp()
  const nav = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [update, setUpdate] = useState<Update | null>(null)
  const [ask, confirmDialog] = useConfirm()

  const run = async (label: string, fn: () => Promise<void>, next: string) => {
    setBusy(label)
    try {
      await fn()
    } catch (e) {
      toast({ kind: 'error', title: errorMessage(e), body: next })
    } finally {
      setBusy(null)
    }
  }

  const restore = async () => {
    const ok = await ask({
      title: 'Restore from a backup?',
      body: 'This replaces ALL current data in the app (websites, content, keywords, settings) with what is in the backup. Make a backup first if you might want today’s data back.',
      confirm: 'Choose backup and restore',
      danger: true
    })
    if (!ok) return
    await run(
      'restore',
      async () => {
        const done = await api('app.restore')
        if (done) {
          toast({ kind: 'success', title: 'Backup restored', body: 'Reloading…' })
          setTimeout(() => window.location.reload(), 600)
        }
      },
      'Your current data was not changed. Check the file is an app backup (.zip) and try again.'
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{info?.appName ?? APP_NAME}</CardTitle>
          <CardDescription>
            Version {info?.version ?? 'unknown'} · MIT License · Free and open source
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              loading={busy === 'update'}
              onClick={() =>
                void run(
                  'update',
                  async () => setUpdate(await api('app.checkUpdates')),
                  'Check your internet connection and try again.'
                )
              }
            >
              {busy !== 'update' && <RefreshCw />} Check for updates
            </Button>
            <Button variant="outline" onClick={() => nav('/setup')}>
              <Wand2 /> Run setup again
            </Button>
          </div>
          {update && (
            <Callout
              kind={update.available ? 'success' : update.latest ? 'info' : 'warning'}
              title={update.available ? 'New version available' : undefined}
            >
              {update.message}
              {update.available && update.url && (
                <div className="mt-2">
                  <Button size="sm" onClick={() => openLink(update.url ?? '')}>
                    <Download /> Download {update.latest}
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The app never installs updates by itself. Download the new version and install it like
                    before.
                  </p>
                </div>
              )}
            </Callout>
          )}
          <div className="flex flex-wrap gap-4">
            <ExternalButton url={DOCS_URL}>Documentation</ExternalButton>
            <ExternalButton url={ISSUES_URL}>Report a problem (GitHub issues)</ExternalButton>
          </div>
          <p className="text-sm text-muted-foreground">
            Made by Autbot. Companion to the book Fire the Agency and the Fire the Agency Playbook.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your data</CardTitle>
          <CardDescription>
            Everything is stored on this computer. Nothing is sent anywhere except to the services you
            connect.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm">
            Data folder: <code className="break-all rounded bg-muted px-1">{info?.dataDir ?? '…'}</code>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              loading={busy === 'open'}
              onClick={() =>
                void run(
                  'open',
                  async () => void (await api('app.openDataFolder')),
                  'Open the folder above yourself in your file manager.'
                )
              }
            >
              {busy !== 'open' && <FolderOpen />} Open data folder
            </Button>
            <Button
              variant="outline"
              loading={busy === 'backup'}
              onClick={() =>
                void run(
                  'backup',
                  async () => {
                    const p = await api('app.backup')
                    if (p) toast({ kind: 'success', title: 'Backup saved', body: p })
                  },
                  'Pick a folder you can write to (like Documents) and try again.'
                )
              }
            >
              {busy !== 'backup' && <Save />} Back up
            </Button>
            <Button variant="outline" loading={busy === 'restore'} onClick={() => void restore()}>
              {busy !== 'restore' && <ArchiveRestore />} Restore from backup
            </Button>
            <Button
              variant="outline"
              loading={busy === 'logs'}
              onClick={() =>
                void run(
                  'logs',
                  async () => {
                    const p = await api('app.exportLogs')
                    if (p) toast({ kind: 'success', title: 'Logs exported', body: p })
                  },
                  'Pick a folder you can write to and try again.'
                )
              }
            >
              {busy !== 'logs' && <FileText />} Export logs
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Backups hold your websites, content, settings and images. API keys and passwords are not included;
            reconnect them after restoring on a new computer. Exported logs have secrets removed, so they are
            safe to attach to a bug report.
          </p>
        </CardContent>
      </Card>
      {confirmDialog}
    </div>
  )
}

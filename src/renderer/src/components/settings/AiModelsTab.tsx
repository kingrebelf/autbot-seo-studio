import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/lib/app-context'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ProviderCards } from './ProviderCards'
import { TaskTable } from './TaskTable'
import { SubscriptionsTable } from './SubscriptionsTable'
import { SwitchRow } from './shared'

export function AiModelsTab() {
  const { settings, setSetting } = useApp()
  const [refreshKey, setRefreshKey] = useState(0)
  const nav = useNavigate()
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">AI providers</h2>
          <p className="text-sm text-muted-foreground">
            Connect at least one. Keys are stored encrypted on this computer only and are never shown again.
          </p>
        </div>
        <ProviderCards onChange={() => setRefreshKey((n) => n + 1)} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Which model does which job</h2>
          <p className="text-sm text-muted-foreground">
            Recommended models are picked for you. Change any of them here.
          </p>
        </div>
        <SwitchRow
          label="Show all models"
          hint="Includes embedding, audio, moderation and old models that are hidden by default."
        >
          <Switch
            checked={settings?.showAllModels ?? false}
            onCheckedChange={(v) => {
              void setSetting('showAllModels', v).then(() => setRefreshKey((n) => n + 1))
            }}
          />
        </SwitchRow>
        <TaskTable refreshKey={refreshKey} />
        <p className="text-xs text-muted-foreground">
          To change what a model can do (for example mark it as able to search the web) or to hide it, use the
          price table in{' '}
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0 text-xs"
            onClick={() => nav('/settings/usage')}
          >
            Usage &amp; Costs
          </Button>
          .
        </p>
      </section>

      <SubscriptionsTable />
    </div>
  )
}

import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '@/components/layout/Layout'
import { PageHeader } from '@/components/ui/misc'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SitesTab } from '@/components/settings/SitesTab'
import { AiModelsTab } from '@/components/settings/AiModelsTab'
import { PublishingTab } from '@/components/settings/PublishingTab'
import { GoogleTab } from '@/components/settings/GoogleTab'
import { DataSourcesTab } from '@/components/settings/DataSourcesTab'
import { PromptsTab } from '@/components/settings/PromptsTab'
import { UsageTab } from '@/components/settings/UsageTab'
import { AppearanceTab } from '@/components/settings/AppearanceTab'
import { AboutTab } from '@/components/settings/AboutTab'

const TABS = [
  { key: 'sites', label: 'Sites', el: SitesTab },
  { key: 'ai', label: 'AI Models', el: AiModelsTab },
  { key: 'publishing', label: 'Publishing', el: PublishingTab },
  { key: 'google', label: 'Google', el: GoogleTab },
  { key: 'data', label: 'Data Sources', el: DataSourcesTab },
  { key: 'prompts', label: 'Prompts', el: PromptsTab },
  { key: 'usage', label: 'Usage & Costs', el: UsageTab },
  { key: 'appearance', label: 'Appearance', el: AppearanceTab },
  { key: 'about', label: 'About', el: AboutTab }
] as const

export default function Settings() {
  const { tab } = useParams()
  const nav = useNavigate()
  const current = TABS.some((t) => t.key === tab) ? (tab as string) : 'sites'
  return (
    <Page>
      <PageHeader title="Settings" />
      <Tabs value={current} onValueChange={(v) => nav(`/settings/${v}`)}>
        <TabsList className="h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} data-testid={`settings-tab-${t.key}`}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-6">
            {current === t.key && <t.el />}
          </TabsContent>
        ))}
      </Tabs>
    </Page>
  )
}

import type { ComponentType } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useEditorCtx } from './context'
import { RIGHT_TABS, isRightTab, type RightTab } from './types'
import { SeoPanel } from './panels/SeoPanel'
import { MetaPanel } from './panels/MetaPanel'
import { LinksPanel } from './panels/LinksPanel'
import { ImagesPanel } from './panels/ImagesPanel'
import { SchemaPanel } from './panels/SchemaPanel'
import { ChecksPanel } from './panels/ChecksPanel'
import { HistoryPanel } from './panels/HistoryPanel'

const PANELS: Record<RightTab, ComponentType> = {
  seo: SeoPanel,
  meta: MetaPanel,
  links: LinksPanel,
  images: ImagesPanel,
  schema: SchemaPanel,
  checks: ChecksPanel,
  history: HistoryPanel
}

export function RightPanel({ tab }: { tab: RightTab }) {
  const { content, checks, setTab } = useEditorCtx()
  const failing = checks.seo.filter((c) => c.state === 'fail').length
  const toConfirm = content.unresolvedConfirms.length + (content.ymyl ? 1 : 0)
  const badge = (id: RightTab): number => (id === 'seo' ? failing : id === 'checks' ? toConfirm : 0)

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => isRightTab(v) && setTab(v)}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="border-b p-2">
        <TabsList className="h-auto w-full justify-start">
          {RIGHT_TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="gap-1">
              {t.label}
              {badge(t.id) > 0 && (
                <span className="rounded-full bg-destructive/15 px-1.5 text-[10px] font-semibold text-destructive">
                  {badge(t.id)}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {RIGHT_TABS.map((t) => {
        const Panel = PANELS[t.id]
        return (
          <TabsContent
            key={t.id}
            value={t.id}
            className="mt-0 min-h-0 flex-1 overflow-y-auto p-4 data-[state=inactive]:hidden"
          >
            {tab === t.id && <Panel />}
          </TabsContent>
        )
      })}
    </Tabs>
  )
}

import { useSearchParams } from 'react-router-dom'
import { Page } from '@/components/layout/Layout'
import { PageHeader } from '@/components/ui/misc'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSite } from '@/lib/app-context'
import { CalendarBoard } from '@/components/plan/CalendarBoard'
import { SparPanel } from '@/components/plan/SparPanel'

export default function Plan() {
  const site = useSite()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'spar' ? 'spar' : 'calendar'

  return (
    <Page wide>
      <PageHeader
        title="Plan"
        description="Decide what to write and when, so each page is live before your customers start searching for it."
      />
      <Tabs
        value={tab}
        onValueChange={(v) => setParams(v === 'spar' ? { tab: 'spar' } : {}, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="spar">Spar with AI</TabsTrigger>
        </TabsList>
        {/* Both tabs stay mounted so the chat is not lost when switching. */}
        <TabsContent value="calendar" forceMount className="mt-4 data-[state=inactive]:hidden">
          <CalendarBoard key={site.id} siteId={site.id} />
        </TabsContent>
        <TabsContent value="spar" forceMount className="mt-4 data-[state=inactive]:hidden">
          <SparPanel key={site.id} />
        </TabsContent>
      </Tabs>
    </Page>
  )
}

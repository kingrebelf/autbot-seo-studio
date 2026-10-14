import { useApp } from '@/lib/app-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GoogleConnect } from './GoogleConnect'
import { IndexNowPanel } from './IndexNowPanel'

export function GoogleTab() {
  const { site } = useApp()
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Google Search Console</CardTitle>
          <CardDescription>
            Free. Shows the searches you already appear for, with real clicks and positions, so the app can
            pick topics that are close to page one. It also re-submits your sitemap when you publish.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GoogleConnect siteId={site?.id ?? null} />
        </CardContent>
      </Card>
      {site && (
        <Card key={site.id}>
          <CardHeader>
            <CardTitle>IndexNow for {site.name}</CardTitle>
            <CardDescription>
              Gets new and updated pages noticed by Bing, Yandex and others within minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IndexNowPanel siteId={site.id} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

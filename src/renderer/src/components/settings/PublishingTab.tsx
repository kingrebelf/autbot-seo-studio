import { useState } from 'react'
import { api } from '@/lib/api'
import { useApp, type Site } from '@/lib/app-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { EmptyState, ErrorText } from '@/components/ui/misc'
import type { ExportFormat } from '@shared/types'
import { WordPressConnect, SEO_PLUGIN_NAMES } from './WordPressConnect'
import { ExportFormatPicker, isExportFormat } from './ExportFormatPicker'
import { SwitchRow, settingsOf, useSaveState } from './shared'

function WpOptions({ site }: { site: Site }) {
  const { reloadSites } = useApp()
  const st = settingsOf(site)
  const [schema, setSchema] = useState<'auto' | 'on' | 'off'>(
    st.addSchemaToContent === true ? 'on' : st.addSchemaToContent === false ? 'off' : 'auto'
  )
  const [cats, setCats] = useState((st.defaultCategories ?? []).join(', '))
  const [author, setAuthor] = useState(st.authorNote ?? '')
  const [revision, setRevision] = useState(Boolean(st.wpRevisionMode))
  const { saving, error, save } = useSaveState()
  const plugin = st.wpSeoPlugin ? (SEO_PLUGIN_NAMES[st.wpSeoPlugin] ?? st.wpSeoPlugin) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Draft options</CardTitle>
        <CardDescription>
          SEO plugin detected: {plugin ?? (site.wpConnected ? 'none' : 'connect WordPress to check')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field
          label="Add schema (structured data) to content"
          hint={
            plugin
              ? `${plugin} already adds its own schema, so "Automatic" leaves it out.`
              : 'Schema helps Google show rich results. "Automatic" adds it only when no SEO plugin is found.'
          }
        >
          <Select
            className="max-w-sm"
            value={schema}
            onChange={(e) =>
              setSchema(e.target.value === 'on' ? 'on' : e.target.value === 'off' ? 'off' : 'auto')
            }
          >
            <option value="auto">Automatic (only when there is no SEO plugin)</option>
            <option value="on">Always add it</option>
            <option value="off">Never add it</option>
          </Select>
        </Field>
        <Field
          label="Default categories"
          hint="Comma-separated. Missing categories are created in WordPress."
        >
          <Input value={cats} onChange={(e) => setCats(e.target.value)} placeholder="Blog, Tips" />
        </Field>
        <Field
          label="Default author note"
          hint="Shown to the AI as who is writing, e.g. “Written by Sam Smith, licensed plumber for 20 years”."
        >
          <Textarea value={author} onChange={(e) => setAuthor(e.target.value)} rows={2} />
        </Field>
        <SwitchRow
          label="Revision mode for refreshes (Advanced)"
          hint='Off (recommended): a refresh is sent as a new draft called "[Refresh] <title>", and your live post is never touched. On: the refresh is saved as a revision of the original post, if your site allows it. You still review and publish it in WordPress.'
        >
          <Switch checked={revision} onCheckedChange={setRevision} />
        </SwitchRow>
        <ErrorText error={error} />
      </CardContent>
      <CardFooter>
        <Button
          loading={saving}
          onClick={() =>
            void save(async () => {
              await api('sites.update', {
                siteId: site.id,
                settings: {
                  addSchemaToContent: schema === 'auto' ? null : schema === 'on',
                  defaultCategories: cats
                    .split(',')
                    .map((c) => c.trim())
                    .filter(Boolean),
                  authorNote: author.trim(),
                  wpRevisionMode: revision
                }
              })
              await reloadSites()
            }, 'Publishing options saved')
          }
        >
          Save
        </Button>
      </CardFooter>
    </Card>
  )
}

export function ExportSection({ site }: { site: Site }) {
  const { reloadSites } = useApp()
  const [format, setFormat] = useState<ExportFormat>(
    isExportFormat(site.exportFormat) ? site.exportFormat : 'generic'
  )
  const { saving, error, save } = useSaveState()
  const pick = (f: ExportFormat) => {
    setFormat(f)
    void save(async () => {
      await api('sites.update', { siteId: site.id, exportFormat: f })
      await reloadSites()
    }, 'Export format saved')
  }
  return (
    <div className="space-y-2">
      <ExportFormatPicker value={format} onChange={pick} disabled={saving} />
      <ErrorText error={error} />
    </div>
  )
}

export function PublishingTab() {
  const { site } = useApp()
  if (!site) return <EmptyState title="Add a website first">Publishing settings are per website.</EmptyState>
  return (
    <div className="space-y-6" key={site.id}>
      <Card>
        <CardHeader>
          <CardTitle>WordPress for {site.name}</CardTitle>
          <CardDescription>Send finished pieces straight to WordPress as drafts.</CardDescription>
        </CardHeader>
        <CardContent>
          <WordPressConnect siteId={site.id} />
        </CardContent>
      </Card>
      <WpOptions site={site} />
      <Card>
        <CardHeader>
          <CardTitle>Export files</CardTitle>
          <CardDescription>
            Not on WordPress? Export a ready-to-paste file set (HTML, Markdown, images and SEO details) in the
            format your site uses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExportSection site={site} />
        </CardContent>
      </Card>
    </div>
  )
}

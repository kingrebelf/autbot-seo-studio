import { useState } from 'react'
import { FileDown, Save, SlidersHorizontal } from 'lucide-react'
import { api, type RouteOutput } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { errorMessage, money, monthLabel } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Input, Select } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ErrorText, Loading, Stat } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { CAPABILITIES, TASKS, type Capability } from '@shared/types'

type Model = RouteOutput<'models.list'>[number]
type Row = RouteOutput<'usage.summary'>['byProvider'][number]

const CAP_LABELS: Record<Capability, string> = {
  text: 'Text',
  json: 'Structured output (JSON)',
  vision: 'Reads images',
  webSearch: 'Web search',
  imageGen: 'Makes images',
  longContext: 'Long documents',
  toolUse: 'Tool use'
}

function SpendTable({ title, rows, label }: { title: string; rows: Row[]; label?: (k: string) => string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No AI use yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium" />
                <th className="py-1 text-right font-medium">Calls</th>
                <th className="py-1 text-right font-medium">Tokens</th>
                <th className="py-1 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t">
                  <td className="max-w-[16rem] truncate py-1.5 pr-2">{label ? label(r.key) : r.key}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.calls.toLocaleString()}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {(r.inputTokens + r.outputTokens).toLocaleString()}
                    {r.images > 0 && <span className="text-muted-foreground"> · {r.images} img</span>}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{money(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

function CapsDialog({
  model,
  open,
  onOpenChange,
  onSaved
}: {
  model: Model
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => Promise<void>
}) {
  const [caps, setCaps] = useState<Set<string>>(() => new Set(model.caps))
  const [hidden, setHidden] = useState(model.hidden)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const detected = new Set(model.capabilities)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const overrides: Record<string, boolean> = {}
      for (const c of CAPABILITIES) {
        const want = caps.has(c)
        if (want !== detected.has(c)) overrides[c] = want
      }
      await api('models.update', { id: model.id, capabilityOverrides: overrides, hidden })
      await onSaved()
      onOpenChange(false)
      toast({ kind: 'success', title: `${model.label} updated` })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{model.label}</DialogTitle>
          <DialogDescription>
            Fix what this model can do if the app guessed wrong. Only models with the right abilities show up
            for each task.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {CAPABILITIES.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={caps.has(c)}
                onChange={(e) => {
                  const next = new Set(caps)
                  if (e.target.checked) next.add(c)
                  else next.delete(c)
                  setCaps(next)
                }}
              />
              {CAP_LABELS[c]}
              {caps.has(c) !== detected.has(c) && <Badge variant="warning">changed</Badge>}
            </label>
          ))}
          <label className="flex items-center gap-2 border-t pt-3 text-sm">
            <Switch checked={hidden} onCheckedChange={setHidden} /> Hide this model from the lists
          </label>
        </div>
        <ErrorText error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const fmt = (n: number | undefined | null) => (n === undefined || n === null ? '' : String(n))

function PriceRow({ m, provider, onSaved }: { m: Model; provider: string; onSaved: () => Promise<void> }) {
  const [input, setInput] = useState(fmt(m.prices?.input))
  const [output, setOutput] = useState(fmt(m.prices?.output))
  const [image, setImage] = useState(fmt(m.prices?.image))
  const [saving, setSaving] = useState(false)
  const [capsOpen, setCapsOpen] = useState(false)
  const dirty =
    input !== fmt(m.prices?.input) || output !== fmt(m.prices?.output) || image !== fmt(m.prices?.image)

  const num = (s: string): number | undefined | null => {
    if (!s.trim()) return undefined
    const n = Number(s.replace(/[$,\s]/g, ''))
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  const save = async () => {
    const vals = [num(input), num(output), num(image)]
    if (vals.some((v) => v === null)) {
      toast({
        kind: 'error',
        title: 'Prices must be numbers',
        body: 'Type dollars like 2.50, or leave the box blank.'
      })
      return
    }
    setSaving(true)
    try {
      await api('models.update', {
        id: m.id,
        prices: { input: vals[0] ?? undefined, output: vals[1] ?? undefined, image: vals[2] ?? undefined }
      })
      await onSaved()
      toast({ kind: 'success', title: `Prices saved for ${m.label}` })
    } catch (e) {
      toast({ kind: 'error', title: errorMessage(e), body: 'Try again.' })
    } finally {
      setSaving(false)
    }
  }

  const cell = (v: string, set: (s: string) => void, label: string) => (
    <td className="p-1">
      <Input
        aria-label={`${m.label} ${label}`}
        className="h-8 w-24 text-right"
        inputMode="decimal"
        value={v}
        placeholder="?"
        onChange={(e) => set(e.target.value)}
      />
    </td>
  )

  return (
    <tr className="border-t">
      <td className="p-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{m.label}</span>
          {m.hidden && <Badge variant="secondary">hidden</Badge>}
          {m.priceEdited && <Badge variant="outline">edited</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">
          {provider} · {m.caps.join(', ')}
        </div>
      </td>
      {cell(input, setInput, 'input price')}
      {cell(output, setOutput, 'output price')}
      {cell(image, setImage, 'image price')}
      <td className="whitespace-nowrap p-1">
        {dirty && (
          <Button size="sm" onClick={() => void save()} loading={saving}>
            {!saving && <Save />} Save
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setCapsOpen(true)} title="Abilities and visibility">
          <SlidersHorizontal /> Abilities
        </Button>
        {capsOpen && <CapsDialog model={m} open={capsOpen} onOpenChange={setCapsOpen} onSaved={onSaved} />}
      </td>
    </tr>
  )
}

export function UsageTab() {
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7))
  const summary = useApi('usage.summary', { month: month || undefined })
  const models = useApi('models.list', { showAll: true })
  const conns = useApi('providers.list', undefined)
  const [exporting, setExporting] = useState(false)
  const providerName = (id: string) => conns.data?.find((c) => c.id === id)?.displayName ?? id
  const taskName = (k: string) => TASKS.find((t) => t.key === k)?.label ?? k
  const months = summary.data?.months ?? []
  const options = Array.from(new Set([new Date().toISOString().slice(0, 7), ...months]))
    .sort()
    .reverse()

  const exportCsv = async () => {
    setExporting(true)
    try {
      const p = await api('usage.exportCsv')
      if (p) toast({ kind: 'success', title: 'Usage exported', body: p })
    } catch (e) {
      toast({ kind: 'error', title: errorMessage(e), body: 'Pick a folder you can write to and try again.' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="usage-month" className="text-sm font-medium">
            Month
          </label>
          <Select id="usage-month" className="w-48" value={month} onChange={(e) => setMonth(e.target.value)}>
            {options.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
            <option value="">All time</option>
          </Select>
        </div>
        <Button variant="outline" onClick={() => void exportCsv()} loading={exporting}>
          {!exporting && <FileDown />} Export CSV
        </Button>
      </div>

      {summary.loading && !summary.data ? (
        <Loading />
      ) : summary.error ? (
        <ErrorText error={`${summary.error} Pick another month or come back later.`} />
      ) : (
        summary.data && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat
                label={month ? `Spent in ${monthLabel(month)}` : 'Spent in total'}
                value={money(summary.data.total)}
                sub="Estimated from the prices below"
              />
              <Stat
                label="AI calls"
                value={summary.data.byProvider.reduce((n, r) => n + r.calls, 0).toLocaleString()}
              />
              <Stat
                label="Images made"
                value={summary.data.byProvider.reduce((n, r) => n + r.images, 0).toLocaleString()}
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <SpendTable title="By provider" rows={summary.data.byProvider} label={providerName} />
              <SpendTable title="By task" rows={summary.data.byTask} label={taskName} />
              <SpendTable
                title="By model"
                rows={summary.data.byModel}
                label={(k) => {
                  const [p, ...rest] = k.split(' / ')
                  return `${providerName(p)} / ${rest.join(' / ')}`
                }}
              />
              <SpendTable title="By website" rows={summary.data.bySite} />
              <SpendTable title="By month" rows={summary.data.byMonth} label={monthLabel} />
            </div>
          </>
        )
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Model prices</CardTitle>
          <CardDescription>
            US dollars per 1 million tokens (input and output) and per image. Filled in from the provider
            where known. Fix them here if your prices differ; costs above use these numbers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {models.loading && !models.data ? (
            <Loading />
          ) : models.error ? (
            <ErrorText error={`${models.error} Refresh models in AI Models, then come back.`} />
          ) : (models.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Connect an AI provider in AI Models to see its models here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">Model</th>
                    <th className="p-1 font-medium">Input $/1M</th>
                    <th className="p-1 font-medium">Output $/1M</th>
                    <th className="p-1 font-medium">$/image</th>
                    <th className="p-1" />
                  </tr>
                </thead>
                <tbody>
                  {(models.data ?? []).map((m) => (
                    <PriceRow
                      key={`${m.id}-${m.updatedAt}`}
                      m={m}
                      provider={providerName(m.providerId)}
                      onSaved={models.reload}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

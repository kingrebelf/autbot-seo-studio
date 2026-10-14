import { useEffect, useState } from 'react'
import { LineChart as LineChartIcon, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAction, useApi } from '@/hooks/useApi'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { EmptyState, ErrorText, Loading, Stat } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { KeywordChart } from './KeywordChart'
import { Change, formatPosition, sourceLabel, type KeywordView } from './shared'

interface Props {
  keyword: KeywordView | null
  groups: string[]
  onClose: () => void
  onChanged: () => void
  onRemove: (k: KeywordView) => void
}

const today = () => new Date().toISOString().slice(0, 10)

export function KeywordDetail({ keyword, groups, onClose, onChanged, onRemove }: Props) {
  const chart = useApi('keywords.chart', keyword ? { id: keyword.id } : null)
  const [group, setGroup] = useState('')
  const [target, setTarget] = useState('')
  const [date, setDate] = useState(today())
  const [position, setPosition] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const [showTable, setShowTable] = useState(false)
  const { busy, run } = useAction()

  useEffect(() => {
    setGroup(keyword?.groupName ?? '')
    setTarget(keyword?.targetPageUrl ?? '')
    setDate(today())
    setPosition('')
    setManualError(null)
    setShowTable(false)
  }, [keyword?.id, keyword?.groupName, keyword?.targetPageUrl])

  if (!keyword) return null
  const dirty = group !== (keyword.groupName ?? '') || target !== (keyword.targetPageUrl ?? '')

  const saveDetails = () =>
    run('details', async () => {
      await api('keywords.update', {
        id: keyword.id,
        groupName: group.trim() || null,
        targetPageUrl: target.trim() || null
      })
      toast({ kind: 'success', title: 'Keyword updated' })
      onChanged()
    })

  const addManual = () =>
    run(
      'manual',
      async () => {
        const p = Number(position.replace(',', '.'))
        if (!Number.isFinite(p) || p < 1) throw new Error('Type a position of 1 or more (1 = top of Google).')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Pick the date you checked the position.')
        await api('keywords.manualRank', { id: keyword.id, date, position: p })
        setPosition('')
        setManualError(null)
        toast({ kind: 'success', title: `Position ${p} saved for ${date}` })
        onChanged()
        void chart.reload()
      },
      setManualError
    )

  const series = chart.data?.series ?? []

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="pr-6">{keyword.keyword}</DialogTitle>
          <DialogDescription>
            {keyword.groupName ? `Group: ${keyword.groupName}. ` : ''}Latest data from{' '}
            {sourceLabel(keyword.latestSource).label.toLowerCase()}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Position" value={formatPosition(keyword.position)} />
          <Stat label="28-day change" value={<Change value={keyword.change28} />} />
          <Stat label="Clicks (28 days)" value={keyword.clicks28.toLocaleString()} />
          <Stat label="Impressions (28 days)" value={keyword.impressions28.toLocaleString()} />
        </div>

        <ErrorText error={chart.error} />
        {chart.loading && !chart.data ? (
          <Loading label="Loading history…" />
        ) : series.length ? (
          chart.data && <KeywordChart data={chart.data} />
        ) : (
          <EmptyState icon={<LineChartIcon className="h-7 w-7" />} title="No history yet">
            Positions appear here once Search Console or DataForSEO reports them, or when you type one in
            below.
          </EmptyState>
        )}

        {series.length > 0 && (
          <div>
            <button
              className="text-sm text-primary underline-offset-4 hover:underline"
              onClick={() => setShowTable((s) => !s)}
            >
              {showTable ? 'Hide the numbers' : 'Show the numbers as a table'}
            </button>
            {showTable && (
              <div className="mt-2 max-h-56 overflow-y-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Date</th>
                      <th className="px-3 py-1.5 text-right font-medium">Position</th>
                      <th className="px-3 py-1.5 text-right font-medium">Clicks</th>
                      <th className="px-3 py-1.5 text-right font-medium">Impressions</th>
                      <th className="px-3 py-1.5 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...series].reverse().map((s) => (
                      <tr key={s.date} className="border-t">
                        <td className="px-3 py-1">{s.date}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{formatPosition(s.position)}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{s.clicks}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{s.impressions}</td>
                        <td className="px-3 py-1 text-muted-foreground">{sourceLabel(s.source).label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Details</h4>
            <Field label="Group" hint="Usually the main (pillar) page this keyword supports.">
              <Input
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                list="keyword-groups"
                placeholder="e.g. Lawn care"
              />
              <datalist id="keyword-groups">
                {groups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </Field>
            <Field label="Target page" hint="The page on your site that should rank for this.">
              <Input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="https://example.com/lawn-aeration"
              />
            </Field>
            <Button
              size="sm"
              onClick={() => void saveDetails()}
              loading={busy === 'details'}
              disabled={!dirty}
            >
              Save details
            </Button>
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Type in a position</h4>
            <p className="text-xs text-muted-foreground">
              Checked it yourself, or have a number from another tool? Add it here. Search Console and
              DataForSEO numbers win if both exist for the same day.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Position">
                <Input
                  type="number"
                  min={1}
                  step="any"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void addManual()}
                  placeholder="e.g. 7"
                />
              </Field>
            </div>
            <ErrorText error={manualError} />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void addManual()}
              loading={busy === 'manual'}
              disabled={!position}
            >
              Save position
            </Button>
          </div>
        </div>

        <div className="flex justify-between border-t pt-4">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => onRemove(keyword)}
          >
            <Trash2 /> Stop tracking
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

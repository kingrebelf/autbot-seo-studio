import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useApi } from '@/hooks/useApi'
import { TASKS, type TaskKey } from '@shared/types'
import { Select } from '@/components/ui/input'

export type Overrides = Record<string, { providerId: string; modelId: string }>

const TEXT_TASKS: TaskKey[] = ['research', 'writing', 'seo', 'factcheck', 'quick']

/** "Advanced": pick a different model for this one piece. Empty = use Settings > AI Models. */
export function ModelOverrides({ value, onChange }: { value: Overrides; onChange: (v: Overrides) => void }) {
  const [open, setOpen] = useState(Object.keys(value).length > 0)
  const { data: models } = useApi('models.list', open ? {} : null)
  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} Advanced: use
        different models for this piece
      </button>
      {open && (
        <div className="space-y-2 border-t p-3">
          {TASKS.filter((t) => TEXT_TASKS.includes(t.key)).map((t) => {
            const fit = (models ?? []).filter((m) => t.needs.every((n) => m.caps.includes(n)))
            const cur = value[t.key]
            return (
              <div key={t.key} className="grid grid-cols-[140px_1fr] items-center gap-2 text-sm">
                <span>{t.label}</span>
                <Select
                  value={cur ? `${cur.providerId}::${cur.modelId}` : ''}
                  onChange={(e) => {
                    const next = { ...value }
                    if (!e.target.value) delete next[t.key]
                    else {
                      const [providerId, modelId] = e.target.value.split('::')
                      next[t.key] = { providerId, modelId }
                    }
                    onChange(next)
                  }}
                >
                  <option value="">Default (from Settings)</option>
                  {fit.map((m) => (
                    <option key={`${m.providerId}::${m.modelId}`} value={`${m.providerId}::${m.modelId}`}>
                      {m.label} ({m.providerId})
                    </option>
                  ))}
                </Select>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

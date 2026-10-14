import { useEffect, useRef, useState } from 'react'
import { Wand2 } from 'lucide-react'
import { api, type RouteOutput } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { useApp } from '@/lib/app-context'
import { errorMessage } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Callout, ErrorText, Loading } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'

type Model = RouteOutput<'models.list'>[number]
type TaskRow = RouteOutput<'tasks.get'>[number]
type Assign = { providerId: string | null; modelId: string | null }

const SEP = '::'
const keyOf = (p: string | null | undefined, m: string | null | undefined) => (p && m ? `${p}${SEP}${m}` : '')
const parse = (v: string): Assign => {
  if (!v) return { providerId: null, modelId: null }
  const i = v.indexOf(SEP)
  return { providerId: v.slice(0, i), modelId: v.slice(i + SEP.length) }
}

function ModelSelect({
  value,
  models,
  providerNames,
  emptyLabel,
  onChange,
  disabled,
  label
}: {
  value: string
  models: Model[]
  providerNames: Map<string, string>
  emptyLabel: string
  onChange: (v: string) => void
  disabled?: boolean
  label: string
}) {
  const groups = new Map<string, Model[]>()
  for (const m of models) groups.set(m.providerId, [...(groups.get(m.providerId) ?? []), m])
  const known = value === '' || models.some((m) => keyOf(m.providerId, m.modelId) === value)
  return (
    <Select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {!known && <option value={value}>{value.replace(SEP, ' / ')} (not available now)</option>}
      {[...groups.entries()].map(([pid, ms]) => (
        <optgroup key={pid} label={providerNames.get(pid) ?? pid}>
          {ms.map((m) => (
            <option key={m.id} value={keyOf(m.providerId, m.modelId)}>
              {m.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  )
}

/**
 * Which model does which job. Used in Settings > AI Models and in the setup wizard.
 * `refreshKey` changes when providers are connected, so the lists reload.
 */
export function TaskTable({
  refreshKey = 0,
  autofillFirst = false
}: {
  refreshKey?: number
  autofillFirst?: boolean
}) {
  const { site, settings } = useApp()
  const [perSite, setPerSite] = useState(false)
  const siteId = perSite && site ? site.id : null
  const tasks = useApi('tasks.get', { siteId })
  const models = useApi('models.list', { showAll: settings?.showAllModels ?? false })
  const conns = useApi('providers.list', undefined)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const didAutofill = useRef(false)

  const reloadAll = async () => {
    await Promise.all([tasks.reload(), models.reload(), conns.reload()])
  }

  useEffect(() => {
    if (refreshKey) void reloadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const autofill = async (quiet = false) => {
    setBusy('autofill')
    setError(null)
    try {
      await api('tasks.autofill')
      await reloadAll()
      if (!quiet)
        toast({ kind: 'success', title: 'Recommended models picked', body: 'You can change any of them.' })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    if (autofillFirst && !didAutofill.current) {
      didAutofill.current = true
      void autofill(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autofillFirst])

  const providerNames = new Map((conns.data ?? []).map((c) => [c.id, c.displayName]))
  const allModels = models.data ?? []

  const save = async (t: TaskRow, which: 'main' | 'fallback', v: string) => {
    setBusy(`${t.key}-${which}`)
    setError(null)
    const current = siteId ? t.siteAssignment : t.assignment
    const a = parse(v)
    try {
      if (which === 'main') {
        await api('tasks.set', { task: t.key, siteId, providerId: a.providerId, modelId: a.modelId })
      } else {
        await api('tasks.set', {
          task: t.key,
          siteId,
          providerId: current?.providerId ?? null,
          modelId: current?.modelId ?? null,
          fallbackProviderId: a.providerId,
          fallbackModelId: a.modelId
        })
      }
      await tasks.reload()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  if ((tasks.loading && !tasks.data) || (models.loading && !models.data))
    return <Loading label="Loading models…" />
  const loadError = tasks.error ?? models.error

  return (
    <div className="space-y-3" data-testid="task-table">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          {site && (
            <>
              <Switch id="per-site" checked={perSite} onCheckedChange={setPerSite} />
              <label htmlFor="per-site">Use different models for {site.name} only</label>
            </>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => void autofill()} loading={busy === 'autofill'}>
          <Wand2 /> Auto-pick recommended models
        </Button>
      </div>
      {loadError && <ErrorText error={`${loadError} Click "Auto-pick recommended models" to try again.`} />}
      <ErrorText error={error} />
      {allModels.length === 0 && (
        <Callout kind="warning" title="No models yet">
          Connect at least one AI provider first, then come back here. Its models appear automatically.
        </Callout>
      )}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Task</th>
              <th className="p-2 font-medium">Model</th>
              <th className="p-2 font-medium">Fallback model</th>
            </tr>
          </thead>
          <tbody>
            {(tasks.data ?? []).map((t) => {
              const ok = allModels.filter((m) => t.needs.every((n) => m.caps.includes(n)))
              const a = siteId ? t.siteAssignment : t.assignment
              const g = t.assignment
              const globalLabel = g?.modelId
                ? `Same as all sites (${allModels.find((m) => m.providerId === g.providerId && m.modelId === g.modelId)?.label ?? g.modelId})`
                : 'Same as all sites'
              return (
                <tr key={t.key} className="border-t align-top">
                  <td className="p-2">
                    <div className="font-medium">{t.label}</div>
                    {t.note && <div className="text-xs text-muted-foreground">{t.note}</div>}
                    {ok.length === 0 && allModels.length > 0 && (
                      <div className="mt-1 text-xs text-warning">
                        None of your connected models can do this ({t.needs.join(', ')}). Connect a provider
                        that can.
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    <ModelSelect
                      label={`${t.label} model`}
                      value={keyOf(a?.providerId, a?.modelId)}
                      models={ok}
                      providerNames={providerNames}
                      emptyLabel={siteId ? globalLabel : ok.length ? 'Pick a model' : 'No suitable model'}
                      disabled={busy !== null || (ok.length === 0 && !siteId)}
                      onChange={(v) => void save(t, 'main', v)}
                    />
                  </td>
                  <td className="p-2">
                    <ModelSelect
                      label={`${t.label} fallback model`}
                      value={keyOf(a?.fallbackProviderId, a?.fallbackModelId)}
                      models={ok}
                      providerNames={providerNames}
                      emptyLabel="No fallback"
                      disabled={busy !== null || ok.length === 0 || (siteId !== null && !a?.modelId)}
                      onChange={(v) => void save(t, 'fallback', v)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        If a model fails, the app tries the fallback model, then tells you what went wrong. Lists only show
        models that can do the task.
      </p>
    </div>
  )
}

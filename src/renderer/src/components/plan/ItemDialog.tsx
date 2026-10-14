import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAction } from '@/hooks/useApi'
import { monthLabel } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { ErrorText } from '@/components/ui/misc'
import { ITEM_STATUSES, type CalendarItem } from './calendar-utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: number
  months: string[]
  /** Editing this item; null means adding a new one. */
  item: CalendarItem | null
  /** Month to pre-select when adding. */
  defaultMonth: string
  onSaved: () => void
}

export function ItemDialog({ open, onOpenChange, siteId, months, item, defaultMonth, onSaved }: Props) {
  const [month, setMonth] = useState(defaultMonth)
  const [title, setTitle] = useState('')
  const [keyword, setKeyword] = useState('')
  const [why, setWhy] = useState('')
  const [itemType, setItemType] = useState('supporting')
  const [focus, setFocus] = useState('')
  const [status, setStatus] = useState('planned')
  const [error, setError] = useState<string | null>(null)
  const { busy, run } = useAction()

  useEffect(() => {
    if (!open) return
    setMonth(item?.month ?? defaultMonth)
    setTitle(item?.title ?? '')
    setKeyword(item?.keyword ?? '')
    setWhy(item?.why ?? '')
    setItemType(item?.itemType ?? 'supporting')
    setFocus(item?.focus ?? '')
    setStatus(item?.status ?? 'planned')
    setError(null)
  }, [open, item, defaultMonth])

  const monthOptions = months.includes(month) ? months : [...months, month].sort()

  const save = () =>
    run(
      'save',
      async () => {
        if (!title.trim()) throw new Error('Give the piece a working title.')
        if (item) {
          await api('calendar.update', {
            id: item.id,
            month,
            title: title.trim(),
            keyword: keyword.trim(),
            why: why.trim(),
            status
          })
        } else {
          const created = await api('calendar.add', {
            siteId,
            month,
            title: title.trim(),
            keyword: keyword.trim() || undefined,
            itemType,
            focus: focus.trim() || undefined
          })
          if (why.trim()) await api('calendar.update', { id: created.id, why: why.trim() })
        }
        onSaved()
        onOpenChange(false)
      },
      setError
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? 'Edit calendar item' : 'Add to the calendar'}</DialogTitle>
          <DialogDescription>
            A page or post you plan to write. Press Start on it when you are ready, and the wizard opens with
            these details filled in.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Month">
              <Select value={month} onChange={(e) => setMonth(e.target.value)}>
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </Select>
            </Field>
            {item ? (
              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {ITEM_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Type">
                <Select value={itemType} onChange={(e) => setItemType(e.target.value)}>
                  <option value="main">Main page</option>
                  <option value="supporting">Supporting post</option>
                </Select>
              </Field>
            )}
          </div>
          <Field label="Working title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Spring lawn aeration: when and why"
              autoFocus
            />
          </Field>
          <Field label="Main keyword" hint="The search people type that this piece should show up for.">
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. lawn aeration"
            />
          </Field>
          {!item && (
            <Field label="Month focus (optional)" hint="The product, service or season this month is about.">
              <Input
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="e.g. Spring lawn care"
              />
            </Field>
          )}
          <Field label="Why now">
            <Textarea
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="e.g. People start searching for this in March, so it should be live by January."
            />
          </Field>
          <ErrorText error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy === 'save'}>
            {item ? 'Save changes' : 'Add item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

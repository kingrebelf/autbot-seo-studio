import type { RouteOutput } from '@/lib/api'

export type CalendarItem = RouteOutput<'calendar.list'>[number]

export const ITEM_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'started', label: 'Started' },
  { value: 'done', label: 'Done' },
  { value: 'skipped', label: 'Skipped' }
] as const

export function statusLabel(s: string): string {
  return ITEM_STATUSES.find((x) => x.value === s)?.label ?? s
}

/** "YYYY-MM" for a date. */
export function ymOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  return ymOf(new Date(y, m - 1 + n, 1))
}

export function monthRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(start, i))
}

/** The month's theme: the main item's focus, else the first focus we find. */
export function focusOf(items: CalendarItem[]): string | null {
  return (
    items.find((i) => i.itemType === 'main' && i.focus)?.focus ?? items.find((i) => i.focus)?.focus ?? null
  )
}

/** Link to the New Content wizard, pre-filled from a calendar item. */
export function startLink(item: CalendarItem): string {
  const notes = [item.keyword ? `Keyword: ${item.keyword}` : '', item.why ? `Why now: ${item.why}` : '']
    .filter(Boolean)
    .join('\n')
  const q = new URLSearchParams({ mode: 'A', topic: item.title, notes, calendarItemId: String(item.id) })
  return `/new?${q.toString()}`
}

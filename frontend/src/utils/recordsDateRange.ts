import {
  startOfDay,
  endOfDay,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
} from 'date-fns'

export type DatePresetId = 'today' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom'

export function rangeFromPreset(id: DatePresetId): { from: Date; to: Date } | null {
  const now = new Date()
  switch (id) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) }
    case '7d':
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) }
    case '30d':
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) }
    case 'thisMonth':
      return { from: startOfMonth(now), to: endOfMonth(now) }
    case 'lastMonth': {
      const last = subMonths(now, 1)
      return { from: startOfMonth(last), to: endOfMonth(last) }
    }
    default:
      return null
  }
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

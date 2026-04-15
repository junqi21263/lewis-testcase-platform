const SORT_KEY = 'records-list-sort-v1'
const PAGE_KEY = 'records-list-page-size-v1'
const COLS_KEY = 'records-list-columns-v1'

export type RecordsSortState = {
  sortBy: 'createdAt' | 'caseCount'
  sortOrder: 'asc' | 'desc'
}

export type RecordsColumnKey =
  | 'source'
  | 'duration'
  | 'operator'
  | 'model'
  | 'cases'
  | 'created'

const defaultSort: RecordsSortState = { sortBy: 'createdAt', sortOrder: 'desc' }

const defaultCols: Record<RecordsColumnKey, boolean> = {
  source: true,
  duration: true,
  operator: true,
  model: true,
  cases: true,
  created: true,
}

export function loadRecordsSort(): RecordsSortState {
  try {
    const raw = localStorage.getItem(SORT_KEY)
    if (!raw) return defaultSort
    const p = JSON.parse(raw) as Partial<RecordsSortState>
    if (p.sortBy !== 'createdAt' && p.sortBy !== 'caseCount') return defaultSort
    if (p.sortOrder !== 'asc' && p.sortOrder !== 'desc') return defaultSort
    return { sortBy: p.sortBy, sortOrder: p.sortOrder }
  } catch {
    return defaultSort
  }
}

export function saveRecordsSort(s: RecordsSortState) {
  localStorage.setItem(SORT_KEY, JSON.stringify(s))
}

export function loadRecordsPageSize(): number {
  try {
    const n = parseInt(localStorage.getItem(PAGE_KEY) || '10', 10)
    if ([10, 20, 50, 100].includes(n)) return n
  } catch {
    /* ignore */
  }
  return 10
}

export function saveRecordsPageSize(n: number) {
  if ([10, 20, 50, 100].includes(n)) localStorage.setItem(PAGE_KEY, String(n))
}

export function loadRecordsColumns(): Record<RecordsColumnKey, boolean> {
  try {
    const raw = localStorage.getItem(COLS_KEY)
    if (!raw) return { ...defaultCols }
    const p = JSON.parse(raw) as Partial<Record<RecordsColumnKey, boolean>>
    return { ...defaultCols, ...p }
  } catch {
    return { ...defaultCols }
  }
}

export function saveRecordsColumns(c: Record<RecordsColumnKey, boolean>) {
  localStorage.setItem(COLS_KEY, JSON.stringify(c))
}

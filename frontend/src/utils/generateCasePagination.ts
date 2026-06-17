export const CASE_PAGE_SIZES = [20, 30, 50] as const
export type CasePageSize = (typeof CASE_PAGE_SIZES)[number]
export const DEFAULT_CASE_PAGE_SIZE: CasePageSize = 20

export function normalizeCasePageSize(value: unknown): CasePageSize {
  const n = Number(value)
  return CASE_PAGE_SIZES.includes(n as CasePageSize) ? (n as CasePageSize) : DEFAULT_CASE_PAGE_SIZE
}

export function getGenerateCasePage<T>(
  rows: readonly T[],
  opts: { page: number; pageSize: number },
): {
  safePage: number
  pageSize: CasePageSize
  totalPages: number
  totalRows: number
  visibleRows: T[]
} {
  const pageSize = normalizeCasePageSize(opts.pageSize)
  const totalRows = rows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const safePage = Math.min(Math.max(1, Math.trunc(Number(opts.page) || 1)), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    safePage,
    pageSize,
    totalPages,
    totalRows,
    visibleRows: rows.slice(start, start + pageSize),
  }
}

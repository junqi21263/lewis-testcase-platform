import { describe, expect, it } from 'vitest'
import { CASE_PAGE_SIZES, getGenerateCasePage } from './generateCasePagination'

describe('generate case pagination', () => {
  const rows = Array.from({ length: 106 }, (_, i) => ({ id: `case-${i + 1}` }))

  it('uses only 20/30/50 as page size options', () => {
    expect(CASE_PAGE_SIZES).toEqual([20, 30, 50])
  })

  it('returns the visible rows for the selected page size', () => {
    const page = getGenerateCasePage(rows, { page: 1, pageSize: 20 })

    expect(page.totalPages).toBe(6)
    expect(page.visibleRows).toHaveLength(20)
    expect(page.visibleRows[0].id).toBe('case-1')
    expect(page.visibleRows[19].id).toBe('case-20')
  })

  it('clamps an out-of-range page without rendering blank rows', () => {
    const page = getGenerateCasePage(rows, { page: 99, pageSize: 50 })

    expect(page.safePage).toBe(3)
    expect(page.totalPages).toBe(3)
    expect(page.visibleRows).toHaveLength(6)
    expect(page.visibleRows[0].id).toBe('case-101')
  })
})

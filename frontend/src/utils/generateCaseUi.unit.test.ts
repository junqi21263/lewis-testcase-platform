import { describe, expect, it } from 'vitest'
import { getCaseUiId } from './generateCaseUi'

describe('generate case UI identity', () => {
  it('uses persisted case id when present', () => {
    expect(getCaseUiId({ id: 'case-1' }, 0)).toBe('case-1')
  })

  it('falls back to a stable result-list index id when generated case has no id', () => {
    expect(getCaseUiId({ id: '' }, 2)).toBe('idx-2')
    expect(getCaseUiId({}, 2)).toBe('idx-2')
  })
})

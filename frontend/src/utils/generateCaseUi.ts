import type { TestCase } from '@/types'

type CaseLike = Pick<TestCase, 'id'> | { id?: string | null }

export function getCaseUiId(testcase: CaseLike, absoluteIndex: number): string {
  const persistedId = testcase.id?.trim()
  return persistedId || `idx-${absoluteIndex}`
}

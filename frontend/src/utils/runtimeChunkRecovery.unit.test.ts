import { describe, expect, it } from 'vitest'
import { isRecoverableChunkError } from './runtimeChunkRecovery'

describe('runtimeChunkRecovery', () => {
  it('detects browser dynamic import chunk failures', () => {
    expect(isRecoverableChunkError(new Error('Failed to fetch dynamically imported module: /assets/DashboardPage-abc.js'))).toBe(true)
    expect(isRecoverableChunkError(new Error('Loading chunk 42 failed.'))).toBe(true)
    expect(isRecoverableChunkError(new Error('Importing a module script failed.'))).toBe(true)
  })

  it('ignores ordinary application errors', () => {
    expect(isRecoverableChunkError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isRecoverableChunkError('plain string')).toBe(false)
  })
})

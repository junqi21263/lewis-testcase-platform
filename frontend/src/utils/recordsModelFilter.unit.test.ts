import { describe, expect, it } from 'vitest'
import { buildRecordsModelFilterOptions, buildRecordsModelFilterParam } from './recordsModelFilter'

describe('records model filter options', () => {
  it('builds single-select options from current backend model configs first', () => {
    const options = buildRecordsModelFilterOptions(
      [
        {
          id: 'cfg-ark',
          name: 'Ark Code',
          provider: 'Ark',
          modelId: 'ark-code-latest',
          baseUrl: '',
          isDefault: true,
          maxTokens: 32768,
          temperature: 0.2,
        },
        {
          id: 'cfg-astron',
          name: 'Astron Code',
          provider: 'Zhipu',
          modelId: 'astron-code-latest',
          baseUrl: '',
          isDefault: false,
          maxTokens: 32768,
          temperature: 0.2,
        },
      ],
      [
        { modelId: 'legacy-model', modelName: 'Legacy History' },
      ],
    )

    expect(options).toEqual([
      {
        key: 'cfg-ark',
        label: 'Ark Code',
        title: 'Ark Code（ark-code-latest）',
        filterValues: ['Ark Code', 'ark-code-latest'],
        source: 'config',
      },
      {
        key: 'cfg-astron',
        label: 'Astron Code',
        title: 'Astron Code（astron-code-latest）',
        filterValues: ['Astron Code', 'astron-code-latest'],
        source: 'config',
      },
    ])
  })

  it('falls back to historical record models only when current configs are empty', () => {
    const options = buildRecordsModelFilterOptions([], [
      { modelId: 'ark-code-latest', modelName: 'Ark Code' },
    ])

    expect(options).toEqual([
      {
        key: 'history:ark-code-latest:Ark Code',
        label: 'Ark Code',
        title: 'Ark Code（ark-code-latest）',
        filterValues: ['Ark Code', 'ark-code-latest'],
        source: 'history',
      },
    ])
  })

  it('returns a csv filter param for one selected model and undefined for all', () => {
    const options = buildRecordsModelFilterOptions(
      [
        {
          id: 'cfg-ark',
          name: 'Ark Code',
          provider: 'Ark',
          modelId: 'ark-code-latest',
          baseUrl: '',
          isDefault: true,
          maxTokens: 32768,
          temperature: 0.2,
        },
      ],
      [],
    )

    expect(buildRecordsModelFilterParam('all', options)).toBeUndefined()
    expect(buildRecordsModelFilterParam('cfg-ark', options)).toBe('Ark Code,ark-code-latest')
  })
})

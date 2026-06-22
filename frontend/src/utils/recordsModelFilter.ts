import type { AIModel } from '@/types'
import type { RecordModelOption } from '@/api/records'

export type RecordsModelFilterOption = {
  key: string
  label: string
  title: string
  filterValues: string[]
  source: 'config' | 'history'
}

function uniqNonEmpty(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))]
}

function formatTitle(label: string, modelId?: string): string {
  const id = String(modelId || '').trim()
  return id && id !== label ? `${label}（${id}）` : label
}

export function buildRecordsModelFilterOptions(
  configuredModels: AIModel[],
  historicalModels: RecordModelOption[] = [],
): RecordsModelFilterOption[] {
  if (configuredModels.length > 0) {
    return configuredModels.map((m) => {
      const label = String(m.name || m.modelId || '未知模型').trim()
      return {
        key: m.id,
        label,
        title: formatTitle(label, m.modelId),
        filterValues: uniqNonEmpty([m.name, m.modelId]),
        source: 'config',
      }
    })
  }

  return historicalModels.map((m) => {
    const label = String(m.modelName || m.modelId || '未知模型').trim()
    return {
      key: `history:${m.modelId}:${m.modelName}`,
      label,
      title: formatTitle(label, m.modelId),
      filterValues: uniqNonEmpty([m.modelName, m.modelId]),
      source: 'history',
    }
  })
}

export function buildRecordsModelFilterParam(
  selectedKey: string,
  options: RecordsModelFilterOption[],
): string | undefined {
  if (!selectedKey || selectedKey === 'all') return undefined
  const option = options.find((item) => item.key === selectedKey)
  if (!option || option.filterValues.length === 0) return undefined
  return option.filterValues.join(',')
}

export function getRecordsModelFilterLabel(
  selectedKey: string,
  options: RecordsModelFilterOption[],
): string | undefined {
  if (!selectedKey || selectedKey === 'all') return undefined
  return options.find((item) => item.key === selectedKey)?.label
}

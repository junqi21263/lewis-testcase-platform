export const BATCH_RECORD_ACTIONS = [
  'SOFT_DELETE',
  'RESTORE',
  'ARCHIVE',
  'CANCEL',
  'PERMANENT_DELETE',
] as const

export type BatchRecordAction = (typeof BATCH_RECORD_ACTIONS)[number]

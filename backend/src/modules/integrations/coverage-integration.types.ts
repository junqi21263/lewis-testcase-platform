export type CoverageIntegrationProvider = 'jira' | 'tapd' | 'feishu'

export type CoverageExecutionState = 'NOT_RUN' | 'PASSED' | 'FAILED' | 'BLOCKED' | 'SKIPPED'

export type CoverageExportCase = {
  caseId?: string
  title: string
  status?: CoverageExecutionState
  automationReadiness?: unknown
}

export type CoverageExportRequirement = {
  reqId: string
  text: string
  risk?: string | null
  issues?: string[]
  latestExecutionStatus?: CoverageExecutionState | string | null
  cases: CoverageExportCase[]
  uncoveredReason?: string | null
}

export type CoverageExportPayload = {
  recordId: string
  recordTitle?: string | null
  generatedAt: string
  requirements: CoverageExportRequirement[]
}

export type CoverageWritebackItem = {
  reqId?: string
  tpId?: string
  caseId?: string
  title?: string
  status: CoverageExecutionState
  actualResult?: string
  externalUrl?: string
}

export type CoverageWritebackPayload = {
  recordId: string
  provider: CoverageIntegrationProvider
  items: CoverageWritebackItem[]
}

export type CoverageIntegrationResult = {
  provider: CoverageIntegrationProvider
  dryRun: boolean
  exported: number
  writtenBack: number
  warnings: string[]
}

// ==================== 通用类型 ====================

/** 统一 API 响应格式 */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  timestamp: string
}

/** 分页参数 */
export interface PaginationParams {
  page: number
  pageSize: number
}

/** 分页数据 */
export interface PaginatedData<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

// ==================== 用户相关 ====================

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER' | 'VIEWER'

export interface User {
  id: string
  email: string
  username: string
  avatar?: string
  role: UserRole
  teamId?: string
  emailVerified?: boolean
  createdAt: string
  updatedAt: string
}

export interface LoginPayload {
  username: string
  password: string
}

export interface RegisterPayload {
  email: string
  username: string
  password: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken?: string
  user: User
}

/** POST /auth/register/send-code、/auth/register/resend-code 返回的 data */
export interface RegisterOtpMeta {
  email: string
  mailConfigured?: boolean
  mailIssues?: string[]
}

// ==================== 团队相关 ====================

export interface Team {
  id: string
  name: string
  description?: string
  ownerId: string
  memberCount: number
  createdAt: string
  updatedAt: string
}

export interface TeamMember {
  id: string
  userId: string
  teamId: string
  role: UserRole
  user: User
  joinedAt: string
}

// ==================== 文件相关 ====================

export type FileType = 'PDF' | 'WORD' | 'EXCEL' | 'YAML' | 'IMAGE' | 'TEXT'
export type FileStatus = 'PENDING' | 'PARSING' | 'PARSED' | 'FAILED'

/** 后端 parseProgress JSON（按需扩展字段） */
export interface FileParseProgress {
  phase?: string
  pageCurrent?: number
  pageTotal?: number
  /** 竖向分块 OCR：当前块序号（与 ocrStripTotal 成对出现） */
  ocrStripCurrent?: number
  /** 竖向分块 OCR：总块数 */
  ocrStripTotal?: number
  etaMinutes?: number
  incremental?: boolean
  fileBytes?: number
  message?: string
  /** 后端 heartbeat 给出的可读失败原因（如图片模糊） */
  errorHint?: string
  extractedChars?: number
  batchIndex?: number
  batchTotal?: number
  textOnly?: boolean
}

export interface UploadedFile {
  id: string
  name: string
  originalName: string
  size: number
  mimeType: string
  fileType: FileType
  status: FileStatus
  parsedContent?: string
  /** 服务端解析阶段（PENDING / CLAIMED / FILE_OK / PDF / WORD / EXCEL / IMAGE / STRUCTURE / DONE / FAILED / CANCELLED） */
  parseStage?: string | null
  /** 解析进度快照（轮询或 SSE 更新） */
  parseProgress?: FileParseProgress | null
  parseRetryHint?: string | null
  /** 服务端解析失败原因 */
  parseError?: string | null
  /** 解析重试次数 */
  parseAttempts?: number
  /** 后端 LLM 结构化后的需求条目 */
  structuredRequirements?: string[] | null
  uploaderId: string
  createdAt: string
}

// ==================== AI 模型相关 ====================

export interface AIModel {
  id: string
  name: string
  provider: string
  modelId: string
  baseUrl: string
  isDefault: boolean
  maxTokens: number
  temperature: number
  supportsVision?: boolean
  useForDocumentVisionParse?: boolean
}

export interface AIGenerateParams {
  /** 对应后端 AIModelConfig.id */
  modelConfigId?: string
  modelId?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
  /** true 时跳过 hunyuan 直出分支，强制走后台所选模型 */
  forceConfiguredModel?: boolean
}

// ==================== 提示词模板 ====================

export type TemplateCategory = 'FUNCTIONAL' | 'PERFORMANCE' | 'SECURITY' | 'API' | 'UI' | 'CUSTOM'

export interface PromptTemplate {
  id: string
  name: string
  description?: string
  category: TemplateCategory
  content: string
  version: number
  variables: TemplateVariable[]
  isPublic: boolean
  creatorId: string
  creator?: User
  usageCount: number
  createdAt: string
  updatedAt: string
}

export interface TemplateVariable {
  name: string
  description: string
  defaultValue?: string
  required: boolean
}

export interface PromptEvaluationSampleResult {
  sampleId: string
  title: string
  parsed: boolean
  caseCount: number
  qualityScore: number
  coverageRate: number | null
  durationMs: number
  warnings: string[]
  error?: string
}

export interface PromptEvaluationFailure {
  sampleId: string
  title: string
  reason: string
  warnings: string[]
}

export interface PromptEvaluationReport {
  templateId: string
  templateName: string
  templateVersion: number
  modelId: string
  modelName: string
  params: {
    temperature: number
    maxTokens: number
  }
  samples: PromptEvaluationSampleResult[]
  sampleCount: number
  parseSuccessRate: number
  averageQualityScore: number
  averageCoverageRate: number | null
  failures: PromptEvaluationFailure[]
  evaluatedAt: string
}

// ==================== 用例集 ====================

export type TestCaseStatus = 'DRAFT' | 'REVIEWING' | 'APPROVED' | 'ARCHIVED'
export type TestCasePriority = 'P0' | 'P1' | 'P2' | 'P3'
export type TestCaseType = 'FUNCTIONAL' | 'PERFORMANCE' | 'SECURITY' | 'COMPATIBILITY' | 'REGRESSION'
export type TestCaseRiskLevel = 'high' | 'medium' | 'low'

/** 生成页偏好（与后端 generation options 对齐） */
export interface GenerationOptions {
  testType: TestCaseType
  granularity: string
  priorityPreset: string
  priorityRule: string
  sceneNormal: number
  sceneAbnormal: number
  sceneBoundary: number
}

export interface TestCase {
  id: string
  title: string
  description?: string
  precondition?: string
  steps: TestStep[]
  expectedResult: string
  actualResult?: string
  priority: TestCasePriority
  riskLevel?: TestCaseRiskLevel
  type: TestCaseType
  tags: string[]
  mermaid?: string | null
  status: TestCaseStatus
  suiteId: string
}

export interface TestStep {
  order: number
  action: string
  expected?: string
}

export interface TestSuite {
  id: string
  name: string
  description?: string
  projectName?: string
  status: TestCaseStatus
  caseCount: number
  creatorId: string
  creator?: User
  teamId?: string
  cases?: TestCase[]
  createdAt: string
  updatedAt: string
}

// ==================== AI 输出质量检查 ====================

export type QualityIssueType =
  | 'duplicate'
  | 'generic_title'
  | 'generic_step'
  | 'generic_expected'
  | 'missing_steps'
  | 'missing_expected'
  | 'low_detail'
  | 'non_executable'

export type CoverageStatus = 'covered' | 'partial' | 'missing'
export type RiskLevel = 'high' | 'medium' | 'low'
export type QualitySeverity = 'high' | 'medium' | 'low'

export interface QualityIssueItem {
  caseTitle: string
  type: QualityIssueType
  severity: QualitySeverity
  message: string
}

export interface CoverageItem {
  requirement: string
  status: CoverageStatus
  matchedCaseTitles: string[]
}

export interface DistributionItem {
  label: string
  count: number
}

export interface QualityReport {
  score: number
  summary: string
  requirementPointsTotal: number
  coverageRate: number | null
  coverage: CoverageItem[]
  duplicateCount: number
  genericCount: number
  nonExecutableCount: number
  riskDistribution: DistributionItem[]
  priorityDistribution: DistributionItem[]
  suggestions: string[]
  issues: QualityIssueItem[]
}

export type ClosedLoopActionType =
  | 'add_missing_requirement'
  | 'refine_generic'
  | 'fix_non_executable'
  | 'mark_duplicate'

export interface ClosedLoopAction {
  type: ClosedLoopActionType
  caseId: string | null
  caseTitle: string
  requirement: string | null
  reason: string
}

export interface ClosedLoopResult {
  recordId: string
  suiteId: string
  beforeScore: number
  afterScore: number
  addedCount: number
  updatedCount: number
  duplicateMarkedCount: number
  cases: TestCase[]
  qualityReport: QualityReport
  actions: ClosedLoopAction[]
  summary: string
}

// ==================== 生成记录 ====================

export type GenerationStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'ARCHIVED'
  | 'CANCELLED'

/** 与后端 GenerationSource 一致 */
export type GenerationSource = 'FILE_PARSE' | 'MANUAL_INPUT' | 'TEMPLATE'

export interface RecordAuditLogEntry {
  id: string
  recordId: string
  operatorId: string
  action: string
  detail?: unknown
  ip?: string | null
  createdAt: string
  operator?: { id: string; username: string; email?: string }
}

/** 列表/详情合并后的导出流水（suite + record 维度） */
export interface RecordDownloadEntry {
  id: string
  source: 'suite' | 'record'
  suiteId: string | null
  format: string
  fileSize?: number | null
  downloadUrl?: string | null
  createdAt: string
  downloader?: { id: string; username: string }
  downloadCount?: number
}

/** 公开分享接口返回（无需登录） */
export interface PublicShareCase {
  id: string
  title: string
  priority: string
  precondition?: string | null
  steps: unknown
  expectedResult: string
}

export interface PublicSharePayload {
  record: {
    id: string
    title: string
    status: GenerationStatus
    caseCount: number
    createdAt: string
    demandContent: string
    generateParams?: unknown
    promptTemplateSnapshot?: string | null
    promptTemplateVersion?: number | null
  }
  cases: PublicShareCase[]
}

export type RecordReviewStatus =
  | 'pending_review'
  | 'in_review'
  | 'approved'
  | 'changes_requested'
  | 'rejected'

export interface GenerationRecord {
  id: string
  title: string
  status: GenerationStatus
  reviewStatus?: RecordReviewStatus
  sourceType: string
  generationSource?: GenerationSource
  prompt: string
  demandContent?: string | null
  generateParams?: Record<string, unknown> | null
  promptTemplateSnapshot?: string | null
  promptTemplateVersion?: number | null
  modelId: string
  modelName: string
  caseCount: number
  suiteId?: string
  fileId?: string
  templateId?: string | null
  teamId?: string | null
  documentParseRecordId?: string | null
  creatorId: string
  creator?: User
  errorMessage?: string
  duration?: number
  tokensUsed?: number
  deletedAt?: string | null
  isDeleted?: boolean
  tags?: string[]
  notes?: string | null
  remark?: string | null
  createdAt: string
  updatedAt: string
  suite?: { id: string; name: string; description?: string | null }
  template?: { id: string; name: string; content: string }
  file?: { id: string; originalName: string; status: string }
  documentParseRecord?: { id: string; title: string; createdAt: string }
  auditLogs?: RecordAuditLogEntry[]
}

// ==================== 下载记录 ====================

export type ExportFormat = 'EXCEL' | 'CSV' | 'JSON' | 'MARKDOWN' | 'YAML'

export interface DownloadRecord {
  id: string
  suiteId: string
  suiteName?: string
  format: ExportFormat
  fileSize?: number
  downloadUrl: string
  downloaderId: string
  createdAt: string
  downloader?: { id: string; username: string }
}

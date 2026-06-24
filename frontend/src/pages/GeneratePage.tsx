import { useState, useCallback, useEffect, useMemo, useDeferredValue, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Upload,
  FileText,
  Type,
  Wand2,
  Loader2,
  ChevronRight,
  X,
  RefreshCw,
  Sparkles,
  Search,
  Filter,
  History,
  ExternalLink,
  Copy,
  Trash2,
  CheckCircle2,
  FileOutput,
  ListFilter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  MoreHorizontal,
  Gauge,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGenerateStore } from '@/store/generateStore'
import { filesApi } from '@/api/files'
import { aiApi } from '@/api/ai'
import { templatesApi } from '@/api/templates'
import { downloadSuiteExport, testcasesApi } from '@/api/testcases'
import { recordsApi } from '@/api/records'
import { parseAiCasesFromText } from '@/utils/parseAiCasesFromText'
import { formatFileSize } from '@/utils/format'
import { loadRecentTemplateIds, pushRecentTemplateId } from '@/utils/recentTemplates'
import {
  exportFilenameTimestamp,
  testcaseDelimitedValues,
  TESTCASE_EXPORT_COLUMNS_CN,
} from '@/utils/testcaseExportFormat'
import { downloadTestcasesXlsx } from '@/utils/exportTestcasesXlsx'
import { copyTextToClipboard } from '@/utils/clipboard'
import { getCaseUiId } from '@/utils/generateCaseUi'
import {
  CASE_PAGE_SIZES,
  DEFAULT_CASE_PAGE_SIZE,
  getGenerateCasePage,
  normalizeCasePageSize,
} from '@/utils/generateCasePagination'
import { extractModuleFromTags } from '@/utils/parseLooseAiOutput'
import {
  buildLocalQualityReport,
  buildCoverageSummaryLabel,
  pickTopQualityIssues,
  summarizeQualitySuggestions,
} from '@/utils/qualityReport'
import {
  buildGenerateHandoffPlan,
  buildGenerateScopePrompt,
  buildGeneratedCaseCoverage,
  type GenerateHandoffPlan,
} from '@/utils/generateHandoffPlan'
import { preprocessPdfForUpload } from '@/utils/pdfPreprocess'
import { appConfirm } from '@/store/appConfirmStore'
import toast from 'react-hot-toast'
import type { TestCase, PromptTemplate, FileStatus, GenerationRecord, QualityReport } from '@/types'
import { useNavigate } from 'react-router-dom'

const INPUT_LENGTH_SOFT_WARN_CHARS = 85_000
const STREAM_LOG_DISPLAY_MAX_CHARS = 48_000

function tailStreamLogForDisplay(content: string): string {
  if (content.length <= STREAM_LOG_DISPLAY_MAX_CHARS) return content
  const tailKb = Math.round(STREAM_LOG_DISPLAY_MAX_CHARS / 1000)
  const totalKb = Math.round(content.length / 1000)
  return `…（流式输出较长，仅显示末尾 ${tailKb}KB / 共 ${totalKb}KB）\n\n${content.slice(-STREAM_LOG_DISPLAY_MAX_CHARS)}`
}

/** 合并生成接口所需的文本来源（文本输入 / 需求描述 / 补充说明） */
function buildGenerateRequestText(
  inputText: string,
  requirementDescription: string,
  userNotes: string,
): string {
  const parts: string[] = []
  const main = inputText.trim()
  const desc = requirementDescription.trim()
  const notes = userNotes.trim()
  if (main) parts.push(main)
  if (desc && desc !== main) parts.push(`【需求描述】\n${desc}`)
  if (notes) parts.push(`【补充说明】\n${notes}`)
  return parts.join('\n\n')
}
const FILE_POLL_INTERVAL_MS = 1000
const FILE_POLL_MAX_ROUNDS = 900
const FILE_POLL_MAX_TRANSIENT_ERRORS = 90
const FILE_TRANSIENT_HTTP_STATUS = new Set([502, 503, 504, 520, 522, 524])

type FlowchartSummary = {
  raw: string
  confidence?: string
  mainPath?: string
  branches: string[]
  nodes: string[]
}

function extractFlowchartSummary(content?: string | null): FlowchartSummary | null {
  const text = content?.trim()
  if (!text?.includes('## 流程图结构化摘要')) return null
  const [, rest = ''] = text.split('## 流程图结构化摘要', 2)
  const raw = `## 流程图结构化摘要${rest}`.trim()
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const pickValue = (label: string) => {
    const line = lines.find((item) => item.startsWith(`- ${label}：`))
    return line?.replace(`- ${label}：`, '').trim()
  }
  const collectAfter = (label: string) => {
    const index = lines.findIndex((item) => item.startsWith(`- ${label}：`))
    if (index < 0) return []
    const result: string[] = []
    for (let i = index + 1; i < lines.length; i++) {
      const line = lines[i]
      if (/^- [\u4e00-\u9fa5A-Za-z/]+：/.test(line)) break
      result.push(line.replace(/^- /, '').trim())
    }
    return result.slice(0, 6)
  }

  return {
    raw,
    confidence: pickValue('置信度'),
    mainPath: pickValue('主流程'),
    branches: collectAfter('异常/分支'),
    nodes: collectAfter('流程节点'),
  }
}

function pollStatus(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } })?.response?.status
  return typeof status === 'number' ? status : undefined
}

function isTransientFilePollError(error: unknown) {
  const status = pollStatus(error)
  if (status != null) return FILE_TRANSIENT_HTTP_STATUS.has(status)
  const e = error as { request?: unknown; code?: string; name?: string }
  return Boolean(e?.request || e?.code === 'ECONNABORTED' || e?.name === 'TimeoutError')
}

const fileStatusLabels: Record<FileStatus, string> = {
  PENDING: '等待解析',
  PARSING: '解析中…',
  PARSED: '解析完成',
  FAILED: '解析失败',
}

async function pollFileUntilParsed(fileId: string) {
  let transientErrors = 0
  for (let i = 0; i < FILE_POLL_MAX_ROUNDS; i++) {
    await new Promise((r) => setTimeout(r, FILE_POLL_INTERVAL_MS))
    try {
      const f = await filesApi.getFileById(fileId)
      transientErrors = 0
      useGenerateStore.getState().setUploadedFile(f)
      if (f.status === 'PARSED') {
        if (f.fileType === 'IMAGE' && !f.parsedContent?.trim()) {
          toast.error('图片未识别出文字，请在下方用文本补充需求，或换更清晰的截图')
        } else {
          toast.success('需求解析完成，可以开始生成')
        }
        return
      }
      if (f.status === 'FAILED') {
        toast.error('文件解析失败，无法用于生成，请换文件重试')
        return
      }
    } catch (e) {
      if (isTransientFilePollError(e) && transientErrors < FILE_POLL_MAX_TRANSIENT_ERRORS) {
        transientErrors++
        continue
      }
      toast.error('解析状态获取失败，请稍后重试')
      return
    }
  }
  toast.error('解析超时，请刷新页面或重新上传')
}

type ExpandField = 'requirement' | 'notes' | 'prompt' | null

function prettyDate(ts?: string) {
  if (!ts) return '--'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

function CasePriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    P0: 'bg-rose-500/10 text-rose-500 ring-rose-500/25',
    P1: 'bg-amber-500/10 text-amber-500 ring-amber-500/25',
    P2: 'bg-sky-500/10 text-sky-500 ring-sky-500/25',
    P3: 'bg-slate-500/10 text-slate-500 ring-slate-500/25',
  }
  return (
    <Badge className={`ring-1 ring-inset ${map[priority] ?? map.P3}`} variant="secondary">
      {priority}
    </Badge>
  )
}

function qualityScoreTone(score: number): string {
  if (score >= 85) return 'text-emerald-500'
  if (score >= 70) return 'text-sky-500'
  if (score >= 60) return 'text-amber-500'
  return 'text-rose-500'
}

function issueTypeLabel(type: string): string {
  const map: Record<string, string> = {
    duplicate: '重复',
    generic_title: '标题空泛',
    generic_step: '步骤空泛',
    generic_expected: '预期空泛',
    missing_steps: '缺少步骤',
    missing_expected: '缺少预期',
    low_detail: '细节不足',
    non_executable: '不可执行',
  }
  return map[type] ?? type
}

function distributionLabel(label: string): string {
  const map: Record<string, string> = {
    high: '高风险',
    medium: '中风险',
    low: '低风险',
  }
  return map[label] ?? label
}

function DistributionBars({
  items,
}: {
  items: { label: string; count: number }[]
}) {
  const total = Math.max(1, items.reduce((sum, item) => sum + item.count, 0))
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[64px_minmax(0,1fr)_32px] items-center gap-2 text-[11px]">
          <span className="text-[hsl(var(--gcs-text-muted))]">{distributionLabel(item.label)}</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--gcs-panel-border))]">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round((item.count / total) * 100)}%` }}
            />
          </div>
          <span className="text-right tabular-nums text-[hsl(var(--gcs-text-secondary))]">{item.count}</span>
        </div>
      ))}
    </div>
  )
}

function QualityReportPanel({ report }: { report: QualityReport | null }) {
  if (!report) return null
  const missing = report.coverage.filter((item) => item.status === 'missing').slice(0, 4)
  const issues = pickTopQualityIssues(report, 5)
  const suggestions = summarizeQualitySuggestions(report)
  return (
    <div className="mt-3 rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-[210px] items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">AI 输出质量检查</p>
            <p className="mt-1 text-xs text-[hsl(var(--gcs-text-muted))]">{report.summary}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-3xl font-bold leading-none ${qualityScoreTone(report.score)}`}>{report.score}</p>
          <p className="mt-1 text-[11px] text-[hsl(var(--gcs-text-muted))]">综合评分</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              需求覆盖
            </span>
            <Badge variant={report.coverageRate != null && report.coverageRate >= 80 ? 'success' : 'warning'}>
              {report.coverageRate == null ? '无法计算' : `${report.coverageRate}%`}
            </Badge>
          </div>
          <p className="text-xs text-[hsl(var(--gcs-text-secondary))]">{buildCoverageSummaryLabel(report)}</p>
          {missing.length > 0 && (
            <div className="mt-2 space-y-1">
              {missing.map((item) => (
                <p key={item.requirement} className="text-[11px] text-amber-600 dark:text-amber-300">
                  缺失：{item.requirement}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] p-3">
          <div className="mb-2 flex items-center gap-1 text-xs font-semibold">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            问题检测
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-[hsl(var(--gcs-panel-muted-bg))] px-2 py-2">
              <p className="font-semibold">{report.duplicateCount}</p>
              <p className="mt-0.5 text-[11px] text-[hsl(var(--gcs-text-muted))]">重复</p>
            </div>
            <div className="rounded-lg bg-[hsl(var(--gcs-panel-muted-bg))] px-2 py-2">
              <p className="font-semibold">{report.genericCount}</p>
              <p className="mt-0.5 text-[11px] text-[hsl(var(--gcs-text-muted))]">空泛</p>
            </div>
            <div className="rounded-lg bg-[hsl(var(--gcs-panel-muted-bg))] px-2 py-2">
              <p className="font-semibold">{report.nonExecutableCount}</p>
              <p className="mt-0.5 text-[11px] text-[hsl(var(--gcs-text-muted))]">不可执行</p>
            </div>
          </div>
          {issues.length > 0 && (
            <div className="mt-2 space-y-1">
              {issues.map((issue, idx) => (
                <p key={`${issue.caseTitle}-${issue.type}-${idx}`} className="text-[11px] text-[hsl(var(--gcs-text-muted))]">
                  {issueTypeLabel(issue.type)}：{issue.caseTitle}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] p-3">
          <p className="mb-2 text-xs font-semibold">优先级分布</p>
          <DistributionBars items={report.priorityDistribution} />
        </div>
        <div className="rounded-xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] p-3">
          <p className="mb-2 text-xs font-semibold">风险分布</p>
          <DistributionBars items={report.riskDistribution} />
        </div>
        <div className="rounded-xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] p-3">
          <p className="mb-2 text-xs font-semibold">改进建议</p>
          <p className="text-[11px] leading-5 text-[hsl(var(--gcs-text-secondary))]">{suggestions}</p>
        </div>
      </div>
    </div>
  )
}

function GenerateHandoffSummaryCard({
  plan,
  title,
  selectedRequirementIds,
  selectedTestPathIds,
}: {
  plan: GenerateHandoffPlan
  title?: string | null
  selectedRequirementIds: string[]
  selectedTestPathIds: string[]
}) {
  return (
    <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-3 ring-1 ring-inset ring-cyan-500/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-[650] text-[hsl(var(--gcs-text-primary))]">AI 需求分析上下文</p>
          <p className="mt-1 line-clamp-1 text-xs text-[hsl(var(--gcs-text-muted))]">
            {title || '已从 AI 需求分析报告接入结构化结果'}
          </p>
        </div>
        <Badge variant="outline" className="border-cyan-500/35 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300">
          覆盖驱动生成
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-xl bg-[hsl(var(--gcs-card-bg))] p-2 ring-1 ring-inset ring-[hsl(var(--gcs-panel-border))]">
          <p className="text-[11px] text-[hsl(var(--gcs-text-muted))]">需求范围</p>
          <p className="mt-1 text-lg font-semibold">{selectedRequirementIds.length}/{plan.requirements.length}</p>
        </div>
        <div className="rounded-xl bg-[hsl(var(--gcs-card-bg))] p-2 ring-1 ring-inset ring-[hsl(var(--gcs-panel-border))]">
          <p className="text-[11px] text-[hsl(var(--gcs-text-muted))]">流程路径</p>
          <p className="mt-1 text-lg font-semibold">{selectedTestPathIds.length}/{plan.testPaths.length}</p>
        </div>
        <div className="rounded-xl bg-[hsl(var(--gcs-card-bg))] p-2 ring-1 ring-inset ring-[hsl(var(--gcs-panel-border))]">
          <p className="text-[11px] text-[hsl(var(--gcs-text-muted))]">质量均分</p>
          <p className="mt-1 text-lg font-semibold">{plan.qualityAverage ?? '--'}</p>
        </div>
        <div className="rounded-xl bg-[hsl(var(--gcs-card-bg))] p-2 ring-1 ring-inset ring-[hsl(var(--gcs-panel-border))]">
          <p className="text-[11px] text-[hsl(var(--gcs-text-muted))]">预计用例</p>
          <p className="mt-1 text-lg font-semibold">{plan.estimatedCaseCount}</p>
        </div>
      </div>
      {(plan.openQuestionCount > 0 || plan.inputWarningCount > 0 || plan.automationSummary.blocked > 0) && (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {plan.openQuestionCount > 0 && <Badge variant="warning">待确认 {plan.openQuestionCount}</Badge>}
          {plan.inputWarningCount > 0 && <Badge variant="warning">输入提醒 {plan.inputWarningCount}</Badge>}
          {plan.automationSummary.blocked > 0 && <Badge variant="outline">阻塞项 {plan.automationSummary.blocked}</Badge>}
        </div>
      )}
    </div>
  )
}

function GenerateScopeSelector({
  plan,
  selectedRequirementIds,
  selectedTestPathIds,
  onRequirementChange,
  onTestPathChange,
}: {
  plan: GenerateHandoffPlan
  selectedRequirementIds: string[]
  selectedTestPathIds: string[]
  onRequirementChange: (ids: string[]) => void
  onTestPathChange: (ids: string[]) => void
}) {
  const reqSet = new Set(selectedRequirementIds)
  const tpSet = new Set(selectedTestPathIds)
  const toggle = (ids: string[], id: string, checked: boolean) =>
    checked ? Array.from(new Set([...ids, id])) : ids.filter((item) => item !== id)

  return (
    <div className="rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-[650] text-[hsl(var(--gcs-text-primary))]">生成范围选择</p>
          <p className="mt-1 text-xs text-[hsl(var(--gcs-text-muted))]">按 REQ/TP 控制本次生成范围，避免无关用例。</p>
        </div>
        <div className="flex gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
            onRequirementChange(plan.requirements.map((item) => item.id))
            onTestPathChange(plan.testPaths.map((item) => item.id))
          }}>
            全选
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
            onRequirementChange([])
            onTestPathChange([])
          }}>
            清空
          </Button>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[hsl(var(--gcs-text-secondary))]">需求 REQ</p>
          <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
            {plan.requirements.map((item) => (
              <label key={item.id} className="flex cursor-pointer gap-2 rounded-xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] p-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-input"
                  checked={reqSet.has(item.id)}
                  onChange={(e) => onRequirementChange(toggle(selectedRequirementIds, item.id, e.target.checked))}
                />
                <span className="min-w-0">
                  <span className="font-semibold text-primary">{item.id}</span>
                  <span className="ml-1 text-[hsl(var(--gcs-text-secondary))]">{item.text}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[hsl(var(--gcs-text-secondary))]">路径 TP</p>
          <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
            {plan.testPaths.length === 0 && (
              <div className="rounded-xl border border-dashed border-[hsl(var(--gcs-panel-border))] p-3 text-xs text-[hsl(var(--gcs-text-muted))]">
                当前分析报告没有结构化 TP 路径，生成时会按需求范围关联。
              </div>
            )}
            {plan.testPaths.map((item) => (
              <label key={item.id} className="flex cursor-pointer gap-2 rounded-xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] p-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-input"
                  checked={tpSet.has(item.id)}
                  onChange={(e) => onTestPathChange(toggle(selectedTestPathIds, item.id, e.target.checked))}
                />
                <span className="min-w-0">
                  <span className={item.type === 'exception' ? 'font-semibold text-amber-500' : 'font-semibold text-cyan-500'}>
                    {item.id}
                  </span>
                  <span className="ml-1 text-[hsl(var(--gcs-text-secondary))]">{item.label}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function GeneratedCoverageMatrix({
  plan,
  cases,
}: {
  plan: GenerateHandoffPlan | null
  cases: TestCase[]
}) {
  if (!plan || plan.requirements.length === 0 || cases.length === 0) return null
  const coverage = buildGeneratedCaseCoverage(plan, cases)
  return (
    <div className="mt-3 rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">REQ/TP 覆盖矩阵</p>
          <p className="mt-1 text-xs text-[hsl(var(--gcs-text-muted))]">
            已覆盖 {coverage.coveredRequirementCount}/{coverage.totalRequirementCount} 个需求
            {coverage.coverageRate != null ? ` · 覆盖率 ${coverage.coverageRate}%` : ''}
            {' '}· 可自动化 {coverage.automatableCount} · 人工 {coverage.manualCount} · 阻塞 {coverage.blockedCount}
          </p>
        </div>
        {coverage.uncoveredRequirements.length > 0 && (
          <Badge variant="warning">未覆盖 {coverage.uncoveredRequirements.length}</Badge>
        )}
      </div>
      <div className="mt-3 grid gap-2">
        {coverage.groups.slice(0, 6).map((group) => (
          <div key={group.requirement.id} className="rounded-xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-xs">
                <span className="font-semibold text-primary">{group.requirement.id}</span>
                <span className="ml-1 text-[hsl(var(--gcs-text-secondary))]">{group.requirement.text}</span>
              </p>
              <Badge variant={group.cases.length > 0 ? 'success' : 'warning'}>
                {group.cases.length} 条
              </Badge>
            </div>
            {group.testPathIds.length > 0 && (
              <p className="mt-1 text-[11px] text-[hsl(var(--gcs-text-muted))]">路径：{group.testPathIds.join(', ')}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function GenerateCoverageCommandCenter({
  plan,
  cases,
  selectedRequirementIds,
  selectedTestPathIds,
  qualityReport,
}: {
  plan: GenerateHandoffPlan | null
  cases: TestCase[]
  selectedRequirementIds?: string[]
  selectedTestPathIds?: string[]
  qualityReport?: QualityReport | null
}) {
  const coverage = plan && cases.length > 0 ? buildGeneratedCaseCoverage(plan, cases) : null
  const reqTotal = plan?.requirements.length ?? 0
  const tpTotal = plan?.testPaths.length ?? 0
  const selectedReq = selectedRequirementIds?.length ?? reqTotal
  const selectedTp = selectedTestPathIds?.length ?? tpTotal
  const coverageRate = coverage?.coverageRate ?? null
  const readiness = coverageRate != null ? `${coverageRate}%` : plan ? '待生成' : '未接入'
  const qualityScore = qualityReport?.score != null ? `${qualityReport.score}` : plan?.qualityAverage != null ? `${plan.qualityAverage}` : '--'
  const blockedCount = coverage?.blockedCount ?? plan?.automationSummary.blocked ?? 0

  return (
    <section
      className="gcs-command-center rounded-2xl border border-cyan-500/20 bg-[hsl(var(--gcs-panel-muted-bg))] p-3"
      data-testid="generate-coverage-command-center"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-[650] text-[hsl(var(--gcs-text-primary))]">覆盖驾驶舱</p>
          <p className="mt-1 text-xs text-[hsl(var(--gcs-text-muted))]">
            {plan ? '按 AI 分析报告的 REQ/TP 追踪生成范围与结果质量。' : '生成后会在这里汇总覆盖、质量和自动化准备度。'}
          </p>
        </div>
        <Badge variant={coverageRate != null && coverageRate >= 80 ? 'success' : plan ? 'warning' : 'outline'}>
          {coverageRate != null ? '覆盖已计算' : plan ? '等待生成' : '普通生成'}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="gcs-command-metric">
          <p>覆盖状态</p>
          <strong>{readiness}</strong>
          <span>{coverage ? `${coverage.coveredRequirementCount}/${coverage.totalRequirementCount} 个需求` : `REQ ${selectedReq}/${reqTotal || selectedReq}`}</span>
        </div>
        <div className="gcs-command-metric">
          <p>路径范围</p>
          <strong>{selectedTp || tpTotal || '--'}</strong>
          <span>{tpTotal ? `TP ${selectedTp}/${tpTotal}` : '按需求推导路径'}</span>
        </div>
        <div className="gcs-command-metric">
          <p>质量评分</p>
          <strong>{qualityScore}</strong>
          <span>{qualityReport ? '生成后质量检查' : '来自分析报告'}</span>
        </div>
        <div className="gcs-command-metric">
          <p>自动化阻塞</p>
          <strong>{blockedCount}</strong>
          <span>缺环境或需人工确认</span>
        </div>
      </div>
    </section>
  )
}

function SoftTextarea(props: {
  title: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  countLimit: number
  minHClass?: string
  maxHClass?: string
  onExpand?: () => void
  disabled?: boolean
  testId?: string
}) {
  const {
    title,
    value,
    onChange,
    placeholder,
    countLimit,
    minHClass = 'min-h-[120px]',
    maxHClass = 'max-h-[260px]',
    onExpand,
    disabled,
    testId,
  } = props

  return (
    <div className="rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[hsl(var(--gcs-text-secondary))]">{title}</p>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-[hsl(var(--gcs-text-muted))]">
            {value.length} / {countLimit}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => onChange('')}
            disabled={disabled || value.length === 0}
          >
            清空
          </Button>
          {onExpand && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={onExpand}
              disabled={disabled}
            >
              展开编辑
            </Button>
          )}
        </div>
      </div>
      <textarea
        data-testid={testId}
        className={`w-full resize-none rounded-xl border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] px-3 py-2 text-sm outline-none ring-0 transition focus:border-[hsl(var(--gcs-input-focus))] focus:shadow-[0_0_0_3px_hsl(var(--gcs-input-focus)/0.18)] disabled:opacity-60 ${minHClass} ${maxHClass} overflow-y-auto`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  )
}

function FileUploadZone() {
  const { setUploadedFile, uploadedFile } = useGenerateStore()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const flowchartSummary = useMemo(
    () => extractFlowchartSummary(uploadedFile?.parsedContent),
    [uploadedFile?.parsedContent],
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (!file) return
      await uploadFile(file)
    },
    [],
  )

  const uploadFile = async (file: File) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'application/x-yaml',
      'image/png',
      'image/jpeg',
    ]
    const okMime = allowed.some((t) => file.type.includes(t.split('/')[1]))
    const okExt = file.name.match(/\.(pdf|docx|xlsx|txt|yaml|yml|png|jpg|jpeg)$/i)
    if (!okMime && !okExt) {
      toast.error('不支持的文件格式，请上传 PDF/Word/Excel/YAML/图片 文件')
      return
    }
    setUploading(true)
    setProgress(0)
    try {
      let toUpload = file
      if (file.name.toLowerCase().endsWith('.pdf')) toUpload = await preprocessPdfForUpload(file)
      const result = await filesApi.upload(toUpload, setProgress)
      setUploadedFile(result)
      toast.success('上传成功，正在解析文档…')
      void pollFileUntilParsed(result.id)
    } catch {
      toast.error('文件上传失败')
    } finally {
      setUploading(false)
    }
  }

  if (uploadedFile) {
    const parsing = uploadedFile.status === 'PENDING' || uploadedFile.status === 'PARSING'
    return (
      <div className="rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] p-3">
        <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <FileText className="h-7 w-7 shrink-0 text-emerald-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{uploadedFile.originalName}</p>
              <p className="text-xs text-[hsl(var(--gcs-text-muted))]">
                {formatFileSize(uploadedFile.size)} · {uploadedFile.fileType}
                {' · '}
                <span className={uploadedFile.status === 'FAILED' ? 'text-destructive' : ''}>
                  {fileStatusLabels[uploadedFile.status]}
                </span>
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setUploadedFile(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {parsing && (
          <p className="mt-2 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-300">
            <Loader2 className="h-3 w-3 animate-spin" />
            正在解析文档，完成后再开始生成
          </p>
        )}
        {flowchartSummary && (
          <div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-200">
                <ListFilter className="h-3.5 w-3.5" />
                流程图摘要
              </p>
              {flowchartSummary.confidence && (
                <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-700 dark:text-sky-200">
                  {flowchartSummary.confidence}
                </span>
              )}
            </div>
            {flowchartSummary.mainPath && (
              <p className="mt-2 line-clamp-2 text-xs text-[hsl(var(--gcs-text-secondary))]">
                {flowchartSummary.mainPath}
              </p>
            )}
            {flowchartSummary.branches.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {flowchartSummary.branches.slice(0, 3).map((branch) => (
                  <span
                    key={branch}
                    className="max-w-full truncate rounded-full bg-[hsl(var(--gcs-card-bg))] px-2 py-1 text-[11px] text-[hsl(var(--gcs-text-secondary))] ring-1 ring-inset ring-sky-500/15"
                    title={branch}
                  >
                    {branch}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      className={`cursor-pointer rounded-2xl border border-dashed bg-[hsl(var(--gcs-dropzone-bg))] p-6 text-center transition ${
        dragging
          ? 'border-[hsl(var(--gcs-input-focus))] shadow-[0_0_0_3px_hsl(var(--gcs-input-focus)/0.2)]'
          : 'border-[hsl(var(--gcs-dropzone-border))] hover:border-[hsl(var(--gcs-input-focus)/0.7)]'
      }`}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <input
        id="file-input"
        type="file"
        className="hidden"
        accept=".pdf,.docx,.xlsx,.txt,.yaml,.yml,.png,.jpg,.jpeg"
        onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
      />
      {uploading ? (
        <div className="space-y-3">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-primary" />
          <p className="text-sm text-[hsl(var(--gcs-text-secondary))]">上传中... {progress}%</p>
          <div className="h-1.5 w-full rounded-full bg-secondary">
            <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <>
          <Upload className="mx-auto mb-3 h-9 w-9 text-[hsl(var(--gcs-text-muted))]" />
          <p className="text-sm font-medium">拖拽文件到这里，或点击上传</p>
          <p className="mt-1 text-xs text-[hsl(var(--gcs-text-muted))]">
            支持 PDF、Word、Excel、YAML、图片
          </p>
        </>
      )}
    </div>
  )
}

function ExpandedEditorDialog(props: {
  open: boolean
  title: string
  value: string
  onChange: (next: string) => void
  onOpenChange: (open: boolean) => void
  placeholder: string
}) {
  const { open, title, value, onChange, onOpenChange, placeholder } = props
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[130] bg-black/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[131] w-[min(920px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-modal-bg))] p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
            <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <textarea
            className="h-[50vh] max-h-[560px] min-h-[320px] w-full resize-none rounded-2xl border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] p-3 text-sm outline-none focus:border-[hsl(var(--gcs-input-focus))] focus:shadow-[0_0_0_3px_hsl(var(--gcs-input-focus)/0.18)]"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function RecentHistoryPanel() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<GenerationRecord[]>([])
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<'ALL' | 'SUCCESS' | 'FAILED' | 'PROCESSING'>('ALL')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await recordsApi.getRecords({
        page: 1,
        pageSize: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      })
      setItems(res.list)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    return items
      .filter((r) => (status === 'ALL' ? true : r.status === status))
      .filter((r) =>
        keyword.trim()
          ? `${r.title} ${r.modelName}`.toLowerCase().includes(keyword.toLowerCase())
          : true,
      )
      .slice(0, 3)
  }, [items, status, keyword])

  const handleDelete = async (id: string) => {
    const ok = await appConfirm({
      title: '删除这条生成记录？',
      description: '删除后可在回收站恢复。',
      confirmText: '确认删除',
      confirmVariant: 'destructive',
    })
    if (!ok) return
    try {
      await recordsApi.deleteRecord(id)
      toast.success('已删除记录')
      await load()
    } catch {
      toast.error('删除失败')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--gcs-text-muted))]">
          <History className="h-3.5 w-3.5" />
          最近 3 条
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => navigate('/records')}
        >
          查看全部
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-lg border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] pl-8 pr-3 text-xs outline-none focus:border-[hsl(var(--gcs-input-focus))]"
              placeholder="搜索记录"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'ALL' | 'SUCCESS' | 'FAILED' | 'PROCESSING')}
            className="h-9 rounded-lg border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] px-2 text-xs"
          >
            <option value="ALL">全部</option>
            <option value="SUCCESS">成功</option>
            <option value="PROCESSING">处理中</option>
            <option value="FAILED">失败</option>
          </select>
        </div>
        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {loading && <p className="text-xs text-[hsl(var(--gcs-text-muted))]">加载中…</p>}
          {!loading && filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-4 text-center">
              <Sparkles className="mx-auto mb-1 h-4 w-4 text-[hsl(var(--gcs-text-muted))]" />
              <p className="text-xs text-[hsl(var(--gcs-text-muted))]">暂无匹配记录</p>
            </div>
          )}
          {filtered.map((r) => (
            <div
              key={r.id}
              className="group rounded-xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] p-2.5"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="line-clamp-1 text-xs font-medium">{r.title}</p>
                <Badge
                  variant={r.status === 'SUCCESS' ? 'success' : r.status === 'FAILED' ? 'destructive' : 'warning'}
                >
                  {r.status}
                </Badge>
              </div>
              <p className="text-[11px] text-[hsl(var(--gcs-text-muted))]">
                {prettyDate(r.createdAt)} · {r.caseCount} 条
              </p>
              <div className="mt-2 flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => navigate(`/records/${r.id}`)}
                >
                  查看
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={async () => {
                    const ok = await copyTextToClipboard(`${r.title} (${r.id})`)
                    if (ok) toast.success('已复制记录信息')
                    else toast.error('复制失败')
                  }}
                >
                  复制
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 px-2 text-[11px] text-destructive opacity-40 transition group-hover:opacity-100"
                  onClick={() => handleDelete(r.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function GenerateResult({ cases, analysisPlan }: { cases: TestCase[]; analysisPlan: GenerateHandoffPlan | null }) {
  const navigate = useNavigate()
  const {
    reset,
    lastRecordId,
    lastSuiteId,
    qualityReport,
    closedLoopStatus,
    closedLoopSummary,
    closedLoopError,
    setClosedLoopStatus,
    applyClosedLoopResult,
    setGeneratedCases,
  } = useGenerateStore()
  const [query, setQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'P0' | 'P1' | 'P2' | 'P3'>('ALL')
  const [typeFilter, setTypeFilter] = useState<'ALL' | string>('ALL')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showMoreActions, setShowMoreActions] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_CASE_PAGE_SIZE)
  const resultScrollRef = useRef<HTMLDivElement>(null)

  const canExport = Boolean(lastSuiteId) || cases.length > 0
  const availableTypes = useMemo(() => Array.from(new Set(cases.map((c) => c.type))), [cases])
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      const hitQuery = query.trim()
        ? `${c.title} ${c.precondition ?? ''} ${c.expectedResult} ${(c.tags ?? []).join(' ')}`.toLowerCase().includes(query.toLowerCase())
        : true
      const hitPriority = priorityFilter === 'ALL' ? true : c.priority === priorityFilter
      const hitType = typeFilter === 'ALL' ? true : c.type === typeFilter
      return hitQuery && hitPriority && hitType
    })
  }, [cases, query, priorityFilter, typeFilter])

  useEffect(() => {
    setPage(1)
  }, [query, priorityFilter, typeFilter])

  const totalFiltered = filteredCases.length
  const pageData = useMemo(
    () => getGenerateCasePage(filteredCases, { page, pageSize }),
    [filteredCases, page, pageSize],
  )
  const totalPages = pageData.totalPages
  const safePage = pageData.safePage

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  useEffect(() => {
    resultScrollRef.current?.scrollTo({ top: 0 })
  }, [safePage, pageSize, query, priorityFilter, typeFilter, cases.length])

  const paginatedCases = pageData.visibleRows

  const stats = useMemo(() => {
    const typeMap = filteredCases.reduce<Record<string, number>>((acc, c) => {
      acc[c.type] = (acc[c.type] ?? 0) + 1
      return acc
    }, {})
    return {
      total: filteredCases.length,
      functional: typeMap.FUNCTIONAL ?? 0,
      edge: typeMap.EDGE ?? 0,
      api: typeMap.API ?? 0,
      negative: typeMap.NEGATIVE ?? 0,
    }
  }, [filteredCases])

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelected = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const caseUiId = useCallback((c: TestCase) => getCaseUiId(c, cases.indexOf(c)), [cases])
  const selectedCases = filteredCases.filter((c) => selected.has(caseUiId(c)))

  const downloadTextFile = (filename: string, content: string, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const toMarkdown = (arr: TestCase[]) => {
    const lines: string[] = []
    lines.push(`# 测试用例（${arr.length} 条）`)
    lines.push('')
    for (const [idx, c] of arr.entries()) {
      lines.push(`## ${idx + 1}. ${c.title}`)
      lines.push('')
      lines.push(`- 优先级：${c.priority}`)
      lines.push(`- 类型：${c.type}`)
      if (c.precondition) lines.push(`- 前置条件：${c.precondition}`)
      lines.push('')
      lines.push('### 步骤')
      for (const s of c.steps ?? []) lines.push(`[${s.order}] ${s.action}${s.expected ? `（期望：${s.expected}）` : ''}`)
      lines.push('')
      lines.push('### 预期结果')
      lines.push(c.expectedResult || '')
      lines.push('')
    }
    return lines.join('\n')
  }

  const handleExport = async (format: 'EXCEL' | 'CSV' | 'JSON' | 'MARKDOWN') => {
    if (!canExport) {
      toast.error('暂无可导出的用例')
      return
    }
    if (lastSuiteId) {
      try {
        await downloadSuiteExport(lastSuiteId, format)
        toast.success('已开始下载')
        return
      } catch {
        // fallback
      }
    }
    const tsName = `${exportFilenameTimestamp()}`
    const resolveModuleLabel = async () => {
      if (!cases[0]?.suiteId) return ''
      try {
        const suite = await testcasesApi.getSuiteById(cases[0].suiteId)
        return (suite.projectName && suite.projectName.trim()) || suite.name || ''
      } catch {
        return ''
      }
    }
    if (format === 'EXCEL') {
      try {
        await downloadTestcasesXlsx(cases, { moduleLabel: await resolveModuleLabel() })
        toast.success('已导出 Excel')
      } catch {
        toast.error('导出 Excel 失败，请稍后重试')
      }
      return
    }
    if (format === 'JSON') {
      downloadTextFile(`${tsName}.json`, JSON.stringify(cases, null, 2), 'application/json;charset=utf-8')
      toast.success('已导出 JSON')
      return
    }
    if (format === 'MARKDOWN') {
      downloadTextFile(`${tsName}.md`, toMarkdown(cases), 'text/markdown;charset=utf-8')
      toast.success('已导出 Markdown')
      return
    }
    if (format === 'CSV') {
      const moduleLabel = await resolveModuleLabel()
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
      const header = TESTCASE_EXPORT_COLUMNS_CN.map((h) => esc(h)).join(',')
      const rows = cases.map((c) => testcaseDelimitedValues(c, moduleLabel).map(esc).join(','))
      downloadTextFile(`${tsName}.csv`, [header, ...rows].join('\n'), 'text/csv;charset=utf-8')
      toast.success('已导出 CSV')
      return
    }
  }

  const handleCopyJson = async () => {
    const text = JSON.stringify(cases, null, 2)
    const ok = await copyTextToClipboard(text)
    if (ok) toast.success('已复制 JSON 到剪贴板')
    else toast.error('复制失败，请手动复制')
  }

  const handleCreateShare = async () => {
    if (!lastRecordId) {
      toast.error('未找到生成记录，无法创建分享链接')
      return
    }
    try {
      const res = await recordsApi.createShare(lastRecordId, { expiresDays: 7 })
      const url = `${window.location.origin}${res.path || `/records/public/shares/${res.token}`}`
      const copied = await copyTextToClipboard(url)
      if (copied) toast.success('分享链接已复制（有效期 7 天）')
      else toast.success(`分享已创建：${url}`)
    } catch {
      toast.error('创建分享链接失败')
    }
  }

  const handleDeleteSelectedLocal = async () => {
    if (selected.size === 0) {
      toast.error('请先选择用例')
      return
    }
    const ok = await appConfirm({
      title: `删除已选 ${selected.size} 条用例？`,
      description: '仅影响当前页面结果，不会删除历史记录中的原始数据。',
      confirmText: '确认删除',
      confirmVariant: 'destructive',
    })
    if (!ok) return
    setGeneratedCases(cases.filter((c) => !selected.has(caseUiId(c))))
    setSelected(new Set())
    toast.success('已删除选中项')
  }

  const handleRunClosedLoop = async () => {
    if (!lastRecordId) {
      toast.error('未找到生成记录，无法执行闭环优化')
      return
    }
    setClosedLoopStatus('running', { summary: null, error: null })
    try {
      const result = await aiApi.runClosedLoop(lastRecordId)
      applyClosedLoopResult(result)
      setSelected(new Set())
      setPage(1)
      toast.success(result.summary || 'AI 闭环优化完成')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'AI 闭环优化失败'
      setClosedLoopStatus('failed', { error: message })
      toast.error(message)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">生成完成</h3>
            <p className="mt-1 text-xs text-[hsl(var(--gcs-text-muted))]">
              共 {cases.length} 条
              {stats.total !== cases.length ? `（筛选 ${stats.total} 条）` : ''}
              {' '}
              · 功能 {stats.functional} · 异常 {stats.negative} · 边界 {stats.edge}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport('EXCEL')} disabled={!canExport}>
              导出 Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('MARKDOWN')} disabled={!canExport}>
              导出 Markdown
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('JSON')} disabled={!canExport}>
              导出 JSON
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyJson} disabled={cases.length === 0}>
              复制 JSON
            </Button>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setShowMoreActions((v) => !v)}>
              <MoreHorizontal className="h-4 w-4" />
              更多
            </Button>
          </div>
        </div>
        {showMoreActions && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-[hsl(var(--gcs-panel-border))] pt-3">
            {lastRecordId && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/records/${lastRecordId}`)}>
                查看记录
              </Button>
            )}
            {lastRecordId && lastSuiteId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/reviews/${lastRecordId}`)}
              >
                进入评审中心
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleCreateShare} disabled={!lastRecordId}>
              生成分享链接
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={async () => {
                const ok = await appConfirm({
                  title: '重新生成前清空当前结果？',
                  description: '你将返回输入区，可重新配置并生成。',
                  confirmText: '确认清空',
                })
                if (ok) reset()
              }}
            >
              <RefreshCw className="h-4 w-4" />
              重新生成
            </Button>
          </div>
        )}
      </div>

      <GenerateCoverageCommandCenter
        plan={analysisPlan}
        cases={cases}
        qualityReport={qualityReport}
      />
      <QualityReportPanel report={qualityReport} />
      <GeneratedCoverageMatrix plan={analysisPlan} cases={cases} />

      {qualityReport && cases.length > 0 && (
        <div className="mt-3 rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-bg))] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-[220px]">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />
                AI 需求-用例闭环代理
              </p>
              <p className="mt-1 text-xs text-[hsl(var(--gcs-text-muted))]">
                自动补齐缺失需求点，修正空泛/不可执行用例，并把原因写入评审中心。
              </p>
              {closedLoopSummary && (
                <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-300">{closedLoopSummary}</p>
              )}
              {closedLoopError && (
                <p className="mt-2 text-xs text-destructive">{closedLoopError}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {lastRecordId && lastSuiteId && closedLoopStatus === 'succeeded' && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/reviews/${lastRecordId}`)}>
                  进入评审中心
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={handleRunClosedLoop}
                disabled={!lastRecordId || closedLoopStatus === 'running'}
              >
                {closedLoopStatus === 'running' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {closedLoopStatus === 'running' ? '优化中' : '生成最终推荐版'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div
        className="mt-3 shrink-0 rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-bg))] p-3"
        data-testid="generate-result-filter-bar"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-full rounded-lg border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] pl-8 pr-3 text-sm outline-none focus:border-[hsl(var(--gcs-input-focus))]"
              placeholder="搜索用例标题/内容/标签"
            />
          </div>
          <div className="flex items-center gap-1 text-xs text-[hsl(var(--gcs-text-muted))]">
            <Filter className="h-3.5 w-3.5" />
            筛选
          </div>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'ALL' | 'P0' | 'P1' | 'P2' | 'P3')}
            className="h-9 rounded-lg border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] px-2 text-xs"
          >
            <option value="ALL">全部优先级</option>
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-lg border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] px-2 text-xs"
          >
            <option value="ALL">全部类型</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => setExpanded(new Set(paginatedCases.map((c) => caseUiId(c))))}
          >
            <ChevronDown className="h-4 w-4" />
            展开本页
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setExpanded(new Set())}>
            <ChevronUp className="h-4 w-4" />
            收起全部
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[hsl(var(--gcs-panel-border))] pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setSelected(new Set(paginatedCases.map((c) => caseUiId(c))))}
          >
            全选本页
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setSelected(new Set(filteredCases.map((c) => caseUiId(c))))}
            disabled={totalFiltered === 0}
          >
            全选筛选结果
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setSelected(new Set())}>
            清空选择
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={async () => {
              if (selectedCases.length === 0) {
                toast.error('请先选择用例')
                return
              }
              const ok = await copyTextToClipboard(JSON.stringify(selectedCases, null, 2))
              if (ok) toast.success(`已复制 ${selectedCases.length} 条`)
              else toast.error('复制失败')
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            批量复制
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => {
              if (selectedCases.length === 0) {
                toast.error('请先选择用例')
                return
              }
              const name = `${exportFilenameTimestamp()}-selected.json`
              downloadTextFile(name, JSON.stringify(selectedCases, null, 2), 'application/json;charset=utf-8')
              toast.success(`已导出 ${selectedCases.length} 条`)
            }}
          >
            <FileOutput className="h-3.5 w-3.5" />
            批量导出
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="ml-auto h-8"
            onClick={handleDeleteSelectedLocal}
          >
            <Trash2 className="h-3.5 w-3.5" />
            批量删除
          </Button>
        </div>
      </div>

      <div
        ref={resultScrollRef}
        className="gcs-result-body-scroll mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1 pb-4"
        data-testid="generate-case-results-board"
      >
        {filteredCases.length === 0 && (
          <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-8 text-center">
            <ListFilter className="mx-auto mb-2 h-5 w-5 text-[hsl(var(--gcs-text-muted))]" />
            <p className="text-sm">没有匹配的用例</p>
            <p className="mt-1 text-xs text-[hsl(var(--gcs-text-muted))]">调整搜索词或筛选条件试试</p>
          </div>
        )}

        {paginatedCases.map((c) => {
          const caseId = caseUiId(c)
          const isExpanded = expanded.has(caseId)
          const caseModule = extractModuleFromTags(c.tags)
          const caseTags = (c.tags ?? []).filter((t) => t && !t.startsWith('模块:'))
          const shortPrecondition =
            !c.precondition || isExpanded
              ? c.precondition
              : `${c.precondition.slice(0, 140)}${c.precondition.length > 140 ? '...' : ''}`
          const showSteps = isExpanded ? c.steps : c.steps.slice(0, 3)
          return (
            <Card
              key={caseId}
              className="overflow-hidden border-[hsl(var(--gcs-testcase-card-border))] bg-[hsl(var(--gcs-testcase-card-bg))] transition hover:bg-[hsl(var(--gcs-card-hover-bg))]"
            >
              <CardContent className="p-4">
                <div className="mb-2 flex min-w-0 items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-input"
                    checked={selected.has(caseId)}
                    onChange={(e) => toggleSelected(caseId, e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold break-words [overflow-wrap:anywhere]">{c.title}</h4>
                      <div className="flex items-center gap-1.5">
                        <CasePriorityBadge priority={c.priority} />
                        <Badge
                          variant="secondary"
                          className="bg-sky-500/10 text-sky-500 ring-1 ring-inset ring-sky-500/20"
                        >
                          {c.type}
                        </Badge>
                      </div>
                    </div>
                    {(caseModule || caseTags.length > 0) && (
                      <p className="mt-1 text-[11px] text-[hsl(var(--gcs-text-muted))]">
                        {caseModule ? `模块：${caseModule}` : ''}
                        {caseModule && caseTags.length > 0 ? ' · ' : ''}
                        {caseTags.length > 0 ? `标签：${caseTags.join(', ')}` : ''}
                      </p>
                    )}
                  </div>
                </div>

                {shortPrecondition && (
                  <div className="mb-2 rounded-lg bg-[hsl(var(--gcs-panel-muted-bg))] px-2.5 py-2 text-xs">
                    <span className="font-medium text-[hsl(var(--gcs-text-secondary))]">前置条件：</span>
                    <span className="text-[hsl(var(--gcs-text-secondary))] break-words [overflow-wrap:anywhere]">{shortPrecondition}</span>
                  </div>
                )}

                <div className="rounded-lg bg-[hsl(var(--gcs-panel-muted-bg))] px-2.5 py-2 text-xs">
                  <p className="mb-1 font-medium text-[hsl(var(--gcs-text-secondary))]">步骤描述</p>
                  <ol className="list-decimal space-y-1 pl-4">
                    {showSteps.map((step) => (
                      <li key={step.order} className="text-[hsl(var(--gcs-text-secondary))] break-words [overflow-wrap:anywhere]">
                        {step.action}
                        {step.expected ? (
                          <span className="ml-1 text-[hsl(var(--gcs-text-muted))]">（期望：{step.expected}）</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                  {!isExpanded && c.steps.length > 3 && (
                    <p className="mt-1 text-[11px] text-[hsl(var(--gcs-text-muted))]">还有 {c.steps.length - 3} 步未展开</p>
                  )}
                </div>

                <p className="mt-2 text-xs">
                  <span className="font-medium text-emerald-500">预期结果：</span>
                  <span className="text-[hsl(var(--gcs-text-secondary))] break-words [overflow-wrap:anywhere]">{c.expectedResult}</span>
                </p>

                <div className="mt-3 flex justify-end">
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleExpanded(caseId)}>
                    {isExpanded ? '收起' : '展开'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      <div className="gcs-result-panel-footer flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-[hsl(var(--gcs-text-muted))]">
        <span>
          共 {cases.length} 条 · 筛选 {totalFiltered} 条 · 已选 {selected.size} 条
        </span>
        {totalFiltered > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span>
              第 {safePage} / {totalPages} 页
            </span>
            <span>·</span>
            <span>每页</span>
            <select
              className="h-7 rounded-lg border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] px-2 text-xs"
              value={pageSize}
              onChange={(e) => {
                setPageSize(normalizeCasePageSize(e.target.value))
                setPage(1)
              }}
            >
              {CASE_PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>条</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function GeneratePage() {
  const navigate = useNavigate()
  const {
    currentStep,
    setStep,
    sourceType,
    setSourceType,
    uploadedFile,
    setUploadedFile,
    inputText,
    setInputText,
    requirementDescription,
    setRequirementDescription,
    userNotes,
    setUserNotes,
    customPrompt,
    setCustomPrompt,
    selectedTemplateId,
    setSelectedTemplateId,
    aiParams,
    setAiParams,
    generatedCases,
    setGeneratedCases,
    qualityReport,
    setLastRecordId,
    setLastSuiteId,
    setQualityReport,
    setClosedLoopStatus,
    isGenerating,
    setIsGenerating,
    streamContent,
    appendStreamContent,
    clearStreamContent,
    analysisHandoffContext,
    setAnalysisHandoffContext,
  } = useGenerateStore()

  const deferredStreamContent = useDeferredValue(streamContent)
  const streamLogDisplay = useMemo(
    () => tailStreamLogForDisplay(deferredStreamContent),
    [deferredStreamContent],
  )

  const [templateOptions, setTemplateOptions] = useState<PromptTemplate[]>([])
  const [recentTplIds, setRecentTplIds] = useState<string[]>(() => loadRecentTemplateIds())
  const [templateKeyword, setTemplateKeyword] = useState('')
  const [expandField, setExpandField] = useState<ExpandField>(null)
  const [showHistory, setShowHistory] = useState(true)
  const [showLogs, setShowLogs] = useState(true)
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [selectedRequirementIds, setSelectedRequirementIds] = useState<string[]>([])
  const [selectedTestPathIds, setSelectedTestPathIds] = useState<string[]>([])

  useEffect(() => {
    const h = useGenerateStore.getState().pendingGenerateHandoff
    if (!h) return
    setCustomPrompt(h.filledPrompt)
    setSelectedTemplateId(h.templateId)
    setSourceType('text')
    if (h.handoffSource === 'ai-analysis') {
      const fallbackText = h.rawText?.trim() || h.filledPrompt.trim()
      setInputText(h.combinedInputText?.trim() || fallbackText)
      setRequirementDescription(h.requirementDescription?.trim() ?? '')
      setUserNotes(h.supplementaryNotes?.trim() ?? '')
      const nextContext = {
        analysisRecordId: h.analysisRecordId,
        analysisTitle: h.analysisTitle,
        structuredResult: h.analysisStructuredResult ?? null,
        sourceReport: h.rawText,
        createdAt: new Date().toISOString(),
      }
      const nextPlan = buildGenerateHandoffPlan(nextContext.structuredResult)
      setAnalysisHandoffContext(nextContext)
      setSelectedRequirementIds(nextPlan.selectedRequirementIds)
      setSelectedTestPathIds(nextPlan.selectedTestPathIds)
    } else {
      setInputText('')
      setRequirementDescription('')
      setUserNotes('')
      setAnalysisHandoffContext(null)
      setSelectedRequirementIds([])
      setSelectedTestPathIds([])
    }
    setUploadedFile(null)
    setStep('prompt')
    useGenerateStore.getState().setPendingGenerateHandoff(null)
    toast.success(
      h.handoffSource === 'ai-analysis'
        ? '已从 AI 需求分析填入文本输入、需求描述与补充说明'
        : '已从需求材料载入需求与提示词，可直接生成',
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const analysisPlan = useMemo(
    () => buildGenerateHandoffPlan(analysisHandoffContext?.structuredResult ?? null),
    [analysisHandoffContext],
  )
  const hasAnalysisPlan = analysisPlan.requirements.length > 0 || analysisPlan.testPaths.length > 0

  useEffect(() => {
    if (!hasAnalysisPlan) return
    setSelectedRequirementIds((current) =>
      current.length ? current : analysisPlan.selectedRequirementIds,
    )
    setSelectedTestPathIds((current) =>
      current.length ? current : analysisPlan.selectedTestPathIds,
    )
  }, [analysisPlan, hasAnalysisPlan])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await templatesApi.getTemplates({ page: 1, pageSize: 100 })
        if (!cancelled) setTemplateOptions(res.list)
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (useGenerateStore.getState().aiParams.modelConfigId) return
    let cancelled = false
    aiApi
      .getModels()
      .then((list) => {
        if (cancelled) return
        const def = list.find((m) => m.isDefault) ?? list[0]
        if (def?.id) setAiParams({ modelConfigId: def.id })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [setAiParams])

  useEffect(() => {
    if (!isGenerating) {
      setPhaseIndex(0)
      return
    }
    const timer = window.setInterval(() => {
      setPhaseIndex((p) => (p >= 3 ? 3 : p + 1))
    }, 1600)
    return () => window.clearInterval(timer)
  }, [isGenerating])

  const templateById = useMemo(
    () => Object.fromEntries(templateOptions.map((t) => [t.id, t] as const)),
    [templateOptions],
  )
  const selectedTemplate = selectedTemplateId ? templateById[selectedTemplateId] : null
  const filteredTemplates = useMemo(() => {
    return templateOptions.filter((t) => {
      if (!templateKeyword.trim()) return true
      const search = `${t.name} ${t.description ?? ''} ${t.category}`.toLowerCase()
      return search.includes(templateKeyword.toLowerCase())
    })
  }, [templateKeyword, templateOptions])
  const recentTemplates = useMemo(
    () => recentTplIds.map((id) => templateById[id]).filter(Boolean) as PromptTemplate[],
    [recentTplIds, templateById],
  )

  const stepItems = [
    { key: 'upload', label: '输入准备' },
    { key: 'prompt', label: '提示词配置' },
    { key: 'generating', label: 'AI 生成' },
    { key: 'result', label: '结果处理' },
  ] as const

  const textReady =
    inputText.trim().length > 0 ||
    requirementDescription.trim().length > 0 ||
    userNotes.trim().length > 0
  const promptReady = customPrompt.trim().length > 0
  const fileReady = sourceType !== 'file' || (uploadedFile && uploadedFile.status === 'PARSED')
  const sourceReady = sourceType === 'file' ? Boolean(uploadedFile) : textReady
  const canStartGenerate = sourceReady && promptReady && fileReady
  const readinessLabel = canStartGenerate
    ? '已准备好生成'
    : sourceType === 'file'
      ? !uploadedFile
        ? '需先上传文档'
        : uploadedFile.status !== 'PARSED'
          ? '等待文档解析完成'
          : '请补充提示词'
      : !textReady
        ? '请填写需求内容'
        : '请补充提示词'

  const handleGenerate = async () => {
    let generationInputText = buildGenerateRequestText(inputText, requirementDescription, userNotes)
    let fileForGeneration = uploadedFile
    if (sourceType === 'file' && !uploadedFile) {
      toast.error('请先上传文件')
      return
    }
    if (sourceType === 'text' && !inputText.trim() && !customPrompt.trim()) {
      toast.error('请输入需求文本，或确保提示词中已包含完整需求描述')
      return
    }
    if (!customPrompt.trim()) {
      toast.error('请输入或选择提示词模板')
      return
    }

    if (sourceType === 'file' && uploadedFile) {
      let file = uploadedFile
      try {
        file = await filesApi.getFileById(uploadedFile.id)
        fileForGeneration = file
        useGenerateStore.getState().setUploadedFile(file)
      } catch {
        toast.error('无法获取文件状态，请重试')
        return
      }
      if (file.status !== 'PARSED') {
        toast.error('请等待文件解析完成（须显示「解析完成」）后再生成')
        return
      }
      if (!file.parsedContent?.trim()) {
        toast.error('文件没有可用文本。请改用文本输入补充需求，或换一份文档。')
        return
      }
      if (!generationInputText.trim()) generationInputText = file.parsedContent
    }
    if (hasAnalysisPlan && analysisPlan.requirements.length > 0 && selectedRequirementIds.length === 0) {
      toast.error('请至少选择一个 REQ 需求范围，或清空 AI 分析上下文后再生成')
      return
    }
    if (hasAnalysisPlan) {
      const scopePrompt = buildGenerateScopePrompt(analysisPlan, selectedRequirementIds, selectedTestPathIds)
      generationInputText = generationInputText.trim()
        ? `${generationInputText}\n\n${scopePrompt}`
        : scopePrompt
    }
    const flowchartContext = sourceType === 'file'
      ? extractFlowchartSummary(fileForGeneration?.parsedContent)?.raw
      : extractFlowchartSummary(generationInputText)?.raw

    setIsGenerating(true)
    clearStreamContent()
    setQualityReport(null)
    setClosedLoopStatus('idle')
    setStep('generating')

    try {
      if (aiParams.stream) {
        await aiApi.generateStream(
          {
            sourceType,
            fileId: fileForGeneration?.id,
            text: generationInputText,
            customPrompt,
            templateId: selectedTemplateId ?? undefined,
            ...aiParams,
            flowchartContext,
          },
          (chunk) => appendStreamContent(chunk),
          async (meta) => {
            const { streamContent: fullText } = useGenerateStore.getState()
            setIsGenerating(false)
            setLastRecordId(meta?.recordId ?? null)
            setLastSuiteId(meta?.suiteId ?? null)
            let cases: TestCase[] = []
            if (meta?.suiteId) {
              try {
                cases = await testcasesApi.getCasesBySuiteId(meta.suiteId)
              } catch {
                toast.error('用例集加载失败，将尝试从流式输出解析')
                cases = []
              }
            }
            if (cases.length === 0) {
              cases = parseAiCasesFromText(fullText)
              if (cases.length === 1 && cases[0]?.tags?.includes('ai-raw-output')) {
                toast.error('未能解析为结构化用例，请到「生成记录」查看或缩小单次生成范围')
              }
            }
            setQualityReport(
              meta?.qualityReport ?? buildLocalQualityReport(generationInputText || customPrompt, cases),
            )
            if (meta?.autoRepair) {
              setClosedLoopStatus('succeeded', { summary: meta.autoRepair.summary, error: null })
            }
            setGeneratedCases(cases)
            setStep('result')
            if (cases.length === 0) toast.error('未生成任何用例，请检查模型或输入内容')
            else {
              toast.success(`用例生成完成，共 ${cases.length} 条`)
              if (
                meta?.caseCount != null &&
                meta.caseCount > 0 &&
                meta.caseCount !== cases.length
              ) {
                toast(
                  `服务端入库 ${meta.caseCount} 条，当前页展示 ${cases.length} 条，请以生成记录为准`,
                  { duration: 9000 },
                )
              }
              if (cases.length === 1 && cases[0]?.tags?.includes('ai-parsed-markdown')) {
                const stepN = cases[0].steps?.length ?? 0
                if (stepN >= 15) {
                  toast(
                    '模型可能只输出了场景清单而未输出 JSON；已尝试拆条，建议关闭深度思考并强调仅输出 { "cases": [...] }',
                    { duration: 10000 },
                  )
                }
              }
            }
          },
          (err) => {
            setIsGenerating(false)
            toast.error(`生成失败: ${err.message}`)
            setStep('prompt')
          },
        )
      } else {
        const result = await aiApi.generateTestCases({
          sourceType,
          fileId: fileForGeneration?.id,
          text: generationInputText,
          customPrompt,
          templateId: selectedTemplateId ?? undefined,
          ...aiParams,
          flowchartContext,
        })
        setGeneratedCases(result.cases)
        setLastRecordId(result.recordId ?? null)
        setQualityReport(
          result.qualityReport ?? buildLocalQualityReport(generationInputText || customPrompt, result.cases),
        )
        if (result.autoRepair) {
          setClosedLoopStatus('succeeded', { summary: result.autoRepair.summary, error: null })
        }
        try {
          const rec = await recordsApi.getRecordById(result.recordId)
          setLastSuiteId(rec.suiteId ?? null)
        } catch {
          setLastSuiteId(null)
        }
        setIsGenerating(false)
        setStep('result')
        if (result.warnings?.length) {
          for (const w of result.warnings) toast(w, { duration: 9000 })
        }
        toast.success(`成功生成 ${result.cases.length} 条用例！`)
      }
    } catch {
      setIsGenerating(false)
      setStep('prompt')
    }
  }

  const phaseLabels = ['解析输入', '理解需求', '生成用例', '结构化整理']

  return (
    <div className="generate-case-studio mx-auto flex h-full min-h-0 w-full max-w-[1520px] flex-col space-y-4 px-4 pb-4 pt-6 md:px-6">
      <div className="gcs-appear-1 flex-shrink-0 rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-bg))] p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">生成测试用例</h1>
            <p className="mt-1 text-sm text-[hsl(var(--gcs-text-muted))]">
              上传需求文档或输入需求描述，AI 自动生成标准化测试用例
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-[hsl(var(--gcs-panel-muted-bg))]">
              模型：{aiParams.modelConfigId ? '已选择' : '自动默认'}
            </Badge>
            <Badge variant="outline" className="bg-[hsl(var(--gcs-panel-muted-bg))]">
              执行策略：{aiParams.forceConfiguredModel === false ? '允许混元直出' : '强制所选模型'}
            </Badge>
            <Badge
              variant={isGenerating ? 'warning' : generatedCases.length > 0 ? 'success' : 'outline'}
              className="bg-[hsl(var(--gcs-panel-muted-bg))]"
            >
              {isGenerating ? '生成中' : generatedCases.length > 0 ? '已完成' : '待开始'}
            </Badge>
            <Button type="button" variant="outline" size="sm" onClick={() => navigate('/templates')}>
              帮助 / 模板管理
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {stepItems.map((item, i) => {
            const idx = stepItems.findIndex((x) => x.key === currentStep)
            const isActive = currentStep === item.key
            const isDone = idx > i
            return (
              <div key={item.key} className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : isDone
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'bg-[hsl(var(--gcs-panel-muted-bg))] text-[hsl(var(--gcs-text-muted))]'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : isDone
                          ? 'bg-emerald-500 text-white'
                          : 'bg-[hsl(var(--gcs-panel-border))] text-[hsl(var(--gcs-text-secondary))]'
                    }`}
                  >
                    {i + 1}
                  </span>
                  {item.label}
                </div>
                {i < stepItems.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-[hsl(var(--gcs-text-muted))]" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-5 overflow-hidden xl:grid-cols-[minmax(360px,40%)_minmax(0,60%)]">
        <section className="gcs-appear-2 flex min-h-0 flex-col gap-4">
          <Card className="flex h-full border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-bg))] xl:min-h-0 xl:flex-1 xl:flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">输入与配置</CardTitle>
              <CardDescription>左侧配置输入，右侧实时查看生成过程和结果</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pb-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
              <div className="space-y-3 rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-3">
                <div className="space-y-1">
                  <p className="text-sm font-[650] text-[hsl(var(--gcs-text-primary))]">输入来源</p>
                  <p className="text-xs text-[hsl(var(--gcs-text-muted))]">选择文档上传、文本输入或从需求分析导入</p>
                </div>
                <div className="grid grid-cols-1 gap-2 rounded-xl bg-[hsl(var(--gcs-card-bg))] p-1.5 ring-1 ring-inset ring-[hsl(var(--gcs-panel-border))] md:grid-cols-3">
                  <button
                    type="button"
                    className={`h-10 rounded-xl px-3 text-sm ring-1 ring-inset transition ${
                      sourceType === 'file'
                        ? 'bg-primary/15 text-primary ring-primary/30'
                        : 'bg-transparent text-[hsl(var(--gcs-text-secondary))] ring-transparent hover:bg-[hsl(var(--gcs-panel-muted-bg))]'
                    }`}
                    onClick={() => setSourceType('file')}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Upload className="h-4 w-4" />
                      上传文档
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`h-10 rounded-xl px-3 text-sm ring-1 ring-inset transition ${
                      sourceType === 'text'
                        ? 'bg-primary/15 text-primary ring-primary/30'
                        : 'bg-transparent text-[hsl(var(--gcs-text-secondary))] ring-transparent hover:bg-[hsl(var(--gcs-panel-muted-bg))]'
                    }`}
                    onClick={() => setSourceType('text')}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Type className="h-4 w-4" />
                      文本输入
                    </span>
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-xl bg-transparent px-3 text-sm text-[hsl(var(--gcs-text-secondary))] ring-1 ring-inset ring-transparent transition hover:bg-[hsl(var(--gcs-panel-muted-bg))]"
                    onClick={() => navigate('/ai-analysis')}
                  >
                    从需求分析导入
                  </button>
                </div>
                <div key={sourceType} className="gcs-switch-stage">
                  {sourceType === 'file' ? (
                    <FileUploadZone />
                  ) : (
                    <SoftTextarea
                      title="文本输入"
                      value={inputText}
                      onChange={setInputText}
                      placeholder="请输入需求描述、功能说明、接口文档内容或业务规则..."
                      countLimit={5000}
                      minHClass="min-h-[140px]"
                      onExpand={() => setExpandField('requirement')}
                      testId="generate-text-input"
                    />
                  )}
                </div>
              </div>

              {hasAnalysisPlan && (
                <>
                  <GenerateHandoffSummaryCard
                    plan={analysisPlan}
                    title={analysisHandoffContext?.analysisTitle}
                    selectedRequirementIds={selectedRequirementIds}
                    selectedTestPathIds={selectedTestPathIds}
                  />
                  <GenerateScopeSelector
                    plan={analysisPlan}
                    selectedRequirementIds={selectedRequirementIds}
                    selectedTestPathIds={selectedTestPathIds}
                    onRequirementChange={setSelectedRequirementIds}
                    onTestPathChange={setSelectedTestPathIds}
                  />
                </>
              )}

              <SoftTextarea
                title="需求描述"
                value={requirementDescription}
                onChange={setRequirementDescription}
                placeholder="请输入需求描述、功能说明、接口文档内容或业务规则..."
                countLimit={5000}
                minHClass="min-h-[140px]"
                onExpand={() => setExpandField('requirement')}
                testId="generate-requirement-description"
              />

              <SoftTextarea
                title="补充说明"
                value={userNotes}
                onChange={setUserNotes}
                placeholder="补充边界条件、角色权限、异常流程、非功能要求等..."
                countLimit={3000}
                minHClass="min-h-[110px]"
                maxHClass="max-h-[220px]"
                onExpand={() => setExpandField('notes')}
                testId="generate-supplementary-notes"
              />

              <div className="rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[hsl(var(--gcs-text-secondary))]">提示词 / 模板配置</p>
                  <Badge variant={customPrompt.trim() ? 'success' : 'outline'}>
                    {customPrompt.trim() ? '已使用自定义指令' : '未填写自定义指令'}
                  </Badge>
                </div>

                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    value={templateKeyword}
                    onChange={(e) => setTemplateKeyword(e.target.value)}
                    placeholder="搜索模板名称/分类"
                    className="h-9 w-full rounded-lg border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] pl-8 pr-3 text-xs outline-none focus:border-[hsl(var(--gcs-input-focus))]"
                  />
                </div>

                {selectedTemplate && (
                  <div className="mb-2 rounded-xl border border-primary/25 bg-primary/5 p-2.5">
                    <p className="text-xs font-semibold text-primary">当前模板：{selectedTemplate.name}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] text-[hsl(var(--gcs-text-muted))]">
                      {selectedTemplate.description || '无描述'}
                    </p>
                  </div>
                )}

                {recentTemplates.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {recentTemplates.slice(0, 6).map((tpl) => (
                      <Button
                        key={tpl.id}
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => {
                          setSelectedTemplateId(tpl.id)
                          setCustomPrompt(tpl.content)
                          pushRecentTemplateId(tpl.id)
                          setRecentTplIds(loadRecentTemplateIds())
                          toast.success(`已载入模板：${tpl.name}`)
                        }}
                      >
                        {tpl.name}
                      </Button>
                    ))}
                  </div>
                )}

                <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
                  {filteredTemplates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      className={`w-full rounded-lg border p-2 text-left transition ${
                        selectedTemplateId === tpl.id
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] hover:bg-[hsl(var(--gcs-card-hover-bg))]'
                      }`}
                      onClick={() => {
                        setSelectedTemplateId(tpl.id)
                        setCustomPrompt(tpl.content)
                        pushRecentTemplateId(tpl.id)
                        setRecentTplIds(loadRecentTemplateIds())
                        toast.success(`已载入模板：${tpl.name}`)
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="line-clamp-1 text-xs font-medium">{tpl.name}</p>
                        <Badge variant="outline">{tpl.category}</Badge>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-3">
                  <SoftTextarea
                    title="自定义提示词"
                    value={customPrompt}
                    onChange={setCustomPrompt}
                    placeholder="例如：请根据以上需求生成完整的功能测试用例，包含正向、逆向和边界测试..."
                    countLimit={12000}
                    minHClass="min-h-[140px]"
                    onExpand={() => setExpandField('prompt')}
                    testId="generate-custom-prompt"
                  />
                </div>
                {customPrompt.length + inputText.length > INPUT_LENGTH_SOFT_WARN_CHARS && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                    当前提示词与文本合计约 {customPrompt.length + inputText.length} 字，已超过建议上限（约{' '}
                    {INPUT_LENGTH_SOFT_WARN_CHARS.toLocaleString()} 字）。
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-3">
                <p className="mb-2 text-xs font-semibold text-[hsl(var(--gcs-text-secondary))]">生成设置</p>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={aiParams.stream}
                      onChange={(e) => setAiParams({ stream: e.target.checked })}
                      className="h-4 w-4 rounded border-input"
                    />
                    流式输出
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={aiParams.forceConfiguredModel !== false}
                      onChange={(e) => setAiParams({ forceConfiguredModel: e.target.checked })}
                      className="h-4 w-4 rounded border-input"
                    />
                    强制使用后台所选模型
                  </label>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[hsl(var(--gcs-text-muted))]">最大 Token</span>
                    <select
                      aria-label="最大 Token"
                      value={aiParams.maxTokens}
                      onChange={(e) => setAiParams({ maxTokens: Number(e.target.value) })}
                      className="h-9 rounded-lg border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] px-2 text-xs"
                    >
                      {[2048, 4096, 8192, 16384, 32768, 65536, 128000].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="mt-2 text-xs text-[hsl(var(--gcs-text-muted))]">
                  开启后将跳过 hunyuan-vision 文件直出通道，始终按系统设置中的已选模型执行生成。
                </p>
              </div>

              <div className="space-y-2 rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-bg))] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-[650] text-[hsl(var(--gcs-text-primary))]">最近生成记录</p>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowHistory((v) => !v)}>
                    {showHistory ? '收起' : '展开'}
                  </Button>
                </div>
                {showHistory && <RecentHistoryPanel />}
              </div>
            </CardContent>

            <div className="gcs-action-footer relative z-[5] min-h-[74px] flex-shrink-0 border-t border-[hsl(var(--gcs-action-footer-border))] bg-[hsl(var(--gcs-action-footer-bg))] px-4 py-3">
              <div className="pointer-events-none absolute -top-3 left-0 right-0 h-3 bg-gradient-to-t from-[hsl(var(--gcs-action-footer-bg))] to-transparent" />
              <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
                <div className="gcs-footer-status flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gcs-action-chip">
                    {sourceType === 'text' ? `文本输入 ${textReady ? '已填写' : '未填写'}` : uploadedFile ? `文档 ${fileStatusLabels[uploadedFile.status]}` : '文档 未上传'}
                  </Badge>
                  <Badge variant="outline" className="gcs-action-chip">文本 {inputText.length} 字</Badge>
                  <Badge variant="outline" className="gcs-action-chip">
                    {selectedTemplate ? `模板：${selectedTemplate.name}` : '未选模板'}
                  </Badge>
                  {hasAnalysisPlan && (
                    <Badge variant="outline" className="gcs-action-chip">
                      REQ {selectedRequirementIds.length}/{analysisPlan.requirements.length}
                      {analysisPlan.testPaths.length ? ` · TP ${selectedTestPathIds.length}/${analysisPlan.testPaths.length}` : ''}
                    </Badge>
                  )}
                  <Badge variant={canStartGenerate ? 'success' : 'outline'} className="gcs-action-chip">
                    {readinessLabel}
                  </Badge>
                </div>
                <div className="gcs-footer-actions ml-auto flex w-full justify-end md:w-auto">
                <Button
                  type="button"
                  size="lg"
                  className="gcs-action-primary h-11 w-full min-w-[148px] gap-2 md:w-auto md:min-w-[164px]"
                  onClick={handleGenerate}
                  disabled={isGenerating || !canStartGenerate}
                  aria-busy={isGenerating}
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {isGenerating ? '生成中...' : '开始生成'}
                </Button>
              </div>
            </div>
            </div>
          </Card>
        </section>

        <section className="gcs-appear-3 flex min-h-0 flex-col overflow-hidden">
          <Card
            className="gcs-result-panel flex h-full min-h-0 flex-col overflow-hidden border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-result-panel-bg))]"
            data-testid="generate-case-results-board"
          >
            <CardHeader className="gcs-result-panel-header shrink-0 border-b pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">AI Generation Console</CardTitle>
                  <CardDescription>实时显示生成过程与结构化测试用例结果</CardDescription>
                </div>
                {isGenerating && <Badge variant="warning">生成中</Badge>}
              </div>
            </CardHeader>
            <CardContent className="gcs-result-panel-body min-h-0 flex-1 overflow-hidden p-0">
              <div className="flex h-full min-h-0 flex-col">
              {!isGenerating && generatedCases.length === 0 && (
                <div className="gcs-result-body-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
                  <GenerateCoverageCommandCenter
                    plan={hasAnalysisPlan ? analysisPlan : null}
                    cases={generatedCases}
                    selectedRequirementIds={selectedRequirementIds}
                    selectedTestPathIds={selectedTestPathIds}
                    qualityReport={qualityReport}
                  />
                  <div
                    className="mt-3 rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-bg))] p-3"
                    data-testid="generate-result-filter-bar"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-[650] text-[hsl(var(--gcs-text-primary))]">结果看板</p>
                        <p className="mt-1 text-xs text-[hsl(var(--gcs-text-muted))]">
                          生成完成后会按 REQ/TP 聚合、筛选、导出和进入评审。
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="gcs-action-chip">覆盖矩阵</Badge>
                        <Badge variant="outline" className="gcs-action-chip">质量检查</Badge>
                        <Badge variant="outline" className="gcs-action-chip">批量操作</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex min-h-[300px] items-center justify-center">
                    <div className="gcs-console-ready w-full max-w-2xl rounded-2xl border border-dashed border-[hsl(var(--gcs-panel-border))] p-8 text-center">
                      <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary" />
                      <p className="text-sm font-semibold">配置输入后，AI 会在这里生成测试用例</p>
                      <p className="mx-auto mt-2 max-w-[520px] text-xs text-[hsl(var(--gcs-text-muted))]">
                        {hasAnalysisPlan
                          ? '已接入 AI 需求分析报告，将按所选 REQ/TP 生成并回填覆盖关系'
                          : '将自动整理为标题、前置条件、步骤、预期结果和优先级'}
                      </p>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        <Badge variant="outline" className="bg-[hsl(var(--gcs-panel-muted-bg))]">用例标题</Badge>
                        <Badge variant="outline" className="bg-[hsl(var(--gcs-panel-muted-bg))]">操作步骤</Badge>
                        <Badge variant="outline" className="bg-[hsl(var(--gcs-panel-muted-bg))]">预期结果</Badge>
                        {hasAnalysisPlan && (
                          <Badge variant="outline" className="bg-[hsl(var(--gcs-panel-muted-bg))]">
                            REQ {selectedRequirementIds.length} / TP {selectedTestPathIds.length}
                          </Badge>
                        )}
                      </div>
                      <div className="mx-auto mt-5 grid max-w-lg gap-2 rounded-xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-bg))] p-3 text-left">
                        <div className="h-3 w-3/5 rounded-full bg-[hsl(var(--gcs-panel-muted-bg))]" />
                        <div className="h-2.5 w-full rounded-full bg-[hsl(var(--gcs-panel-muted-bg))]" />
                        <div className="h-2.5 w-5/6 rounded-full bg-[hsl(var(--gcs-panel-muted-bg))]" />
                        <div className="h-2.5 w-2/3 rounded-full bg-[hsl(var(--gcs-panel-muted-bg))]" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isGenerating && (
                <div className="gcs-result-body-scroll min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-4">
                  <div className="rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-3">
                    <p className="mb-2 text-sm font-semibold">生成进度</p>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {phaseLabels.map((label, idx) => (
                        <div
                          key={label}
                          className={`rounded-lg border px-2.5 py-2 text-xs ${
                            idx <= phaseIndex
                              ? 'border-primary/35 bg-primary/10 text-primary'
                              : 'border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] text-[hsl(var(--gcs-text-muted))]'
                          }`}
                        >
                          <span className="inline-flex items-center gap-1">
                            {idx <= phaseIndex ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              <Loader2 className="h-3.5 w-3.5" />
                            )}
                            {label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">流式日志</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setShowLogs((v) => !v)}
                      >
                        {showLogs ? '折叠' : '展开'}
                      </Button>
                    </div>
                    {showLogs && (
                      <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] p-3 font-mono text-xs">
                        {streamLogDisplay || '等待 AI 响应...'}
                      </pre>
                    )}
                  </div>
                </div>
              )}

                {!isGenerating && generatedCases.length > 0 && (
                  <div className="min-h-0 flex-1 overflow-hidden p-4">
                    <GenerateResult cases={generatedCases} analysisPlan={hasAnalysisPlan ? analysisPlan : null} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      <ExpandedEditorDialog
        open={expandField === 'requirement'}
        title="展开编辑：需求描述"
        value={requirementDescription}
        onChange={setRequirementDescription}
        onOpenChange={(open) => setExpandField(open ? 'requirement' : null)}
        placeholder="请输入需求描述、功能说明、接口文档内容或业务规则..."
      />
      <ExpandedEditorDialog
        open={expandField === 'notes'}
        title="展开编辑：补充说明"
        value={userNotes}
        onChange={setUserNotes}
        onOpenChange={(open) => setExpandField(open ? 'notes' : null)}
        placeholder="补充边界条件、角色权限、异常流程、非功能要求等..."
      />
      <ExpandedEditorDialog
        open={expandField === 'prompt'}
        title="展开编辑：自定义提示词"
        value={customPrompt}
        onChange={setCustomPrompt}
        onOpenChange={(open) => setExpandField(open ? 'prompt' : null)}
        placeholder="请输入模板指令或自定义提示词..."
      />
    </div>
  )
}

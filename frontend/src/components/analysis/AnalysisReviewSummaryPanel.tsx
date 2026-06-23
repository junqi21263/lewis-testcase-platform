import { GitCompare, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { AnalysisStructuredResult } from '@/types'
import { buildAnalysisReviewSummary } from '@/utils/analysisReviewSummary'

type AnalysisVersionBadge = {
  id: string
  versionNumber: number
  sourceType: string
  modelName: string
}

type AnalysisDiffField = {
  field: string
  label: string
  before: string
  after: string
  changed: boolean
}

type Props = {
  structured: AnalysisStructuredResult
  currentVersion?: number | null
  versions?: AnalysisVersionBadge[]
  diff?: AnalysisDiffField[]
  versionsOpen?: boolean
  versionLoading?: boolean
  crossReviewBusy?: boolean
  canLoadVersions?: boolean
  canRunCrossReview?: boolean
  compact?: boolean
  onLoadVersions?: () => void
  onCrossReview?: () => void
}

export function AnalysisReviewSummaryPanel({
  structured,
  currentVersion,
  versions = [],
  diff = [],
  versionsOpen = false,
  versionLoading = false,
  crossReviewBusy = false,
  canLoadVersions = false,
  canRunCrossReview = false,
  compact = false,
  onLoadVersions,
  onCrossReview,
}: Props) {
  const summary = buildAnalysisReviewSummary(structured)
  const changedDiff = diff.filter((f) => f.changed)

  return (
    <div
      className={`space-y-3 rounded-lg border p-3 text-xs text-workspace-text-secondary ${
        summary.reviewPriority === 'needs_attention'
          ? 'border-amber-500/25 bg-amber-500/[0.07] dark:bg-amber-500/[0.08]'
          : 'border-workspace-panel-border/70 bg-workspace-panel-muted/45 dark:border-white/10 dark:bg-slate-950/35'
      }`}
      data-testid="analysis-review-summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-workspace-text-primary">
            {compact ? '审阅确认清单' : '需求覆盖闭环'}
          </p>
          <p className="mt-0.5 text-[11px] text-workspace-text-muted">
            {currentVersion ? `当前报告 v${currentVersion} · ` : ''}
            {summary.coverageText}
          </p>
        </div>
        {!compact && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 border-workspace-panel-border/70 px-2 text-[11px]"
              disabled={versionLoading || !canLoadVersions}
              onClick={onLoadVersions}
            >
              {versionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitCompare className="h-3 w-3" />}
              版本/Diff
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 border-workspace-panel-border/70 px-2 text-[11px]"
              disabled={crossReviewBusy || !canRunCrossReview}
              onClick={onCrossReview}
            >
              {crossReviewBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              交叉评审
            </Button>
          </div>
        )}
      </div>

      {summary.qualityItems.length > 0 && (
        <div className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-5' : 'sm:grid-cols-5'}`}>
          {summary.qualityItems.map((item) => (
            <div key={item.label} className="rounded-md border border-workspace-panel-border/60 bg-workspace-card-bg/70 p-2">
              <p className="text-[11px] text-workspace-text-muted">{item.label}</p>
              <p className="mt-1 text-base font-semibold text-workspace-text-primary">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {(summary.warnings.length > 0 || summary.openQuestions.length > 0 || !compact) && (
        <div className="grid gap-2 lg:grid-cols-2">
          <div className="rounded-md border border-amber-500/25 bg-amber-500/10 p-2">
            <p className="font-medium text-amber-800 dark:text-amber-200">输入质量提醒</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {summary.warnings.slice(0, compact ? 3 : 5).map((w, idx) => (
                <li key={`${w}-${idx}`}>{w}</li>
              ))}
              {summary.warnings.length === 0 && <li>暂无明显低质量输入提醒</li>}
            </ul>
          </div>
          <div className="rounded-md border border-cyan-500/25 bg-cyan-500/10 p-2">
            <p className="font-medium text-cyan-800 dark:text-cyan-200">待确认问题</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {summary.openQuestions.slice(0, compact ? 3 : 5).map((q, idx) => (
                <li key={`${q}-${idx}`}>{q}</li>
              ))}
              {summary.openQuestions.length === 0 && <li>暂无待确认问题</li>}
            </ul>
          </div>
        </div>
      )}

      {!compact && (structured.testStrategy || structured.automationReadiness) && (
        <div className="grid gap-2 lg:grid-cols-2">
          <div className="rounded-md border border-workspace-panel-border/60 bg-workspace-card-bg/70 p-2">
            <p className="font-medium text-workspace-text-primary">一键测试策略</p>
            <p className="mt-1">范围：{summary.testStrategyText.scope}</p>
            <p className="mt-1">类型：{summary.testStrategyText.types}</p>
            <p className="mt-1">准入：{summary.testStrategyText.entryCriteria}</p>
            <p className="mt-1">准出：{summary.testStrategyText.exitCriteria}</p>
          </div>
          <div className="rounded-md border border-workspace-panel-border/60 bg-workspace-card-bg/70 p-2">
            <p className="font-medium text-workspace-text-primary">Agent 执行准备</p>
            <p className="mt-1">可自动化：{summary.automationText.automatable}</p>
            <p className="mt-1">需人工：{summary.automationText.manual}</p>
            <p className="mt-1">缺环境：{summary.automationText.blocked}</p>
          </div>
        </div>
      )}

      {versionsOpen && (
        <div className="rounded-md border border-workspace-panel-border/60 bg-workspace-card-bg/70 p-2">
          <div className="flex flex-wrap gap-1.5">
            {versions.map((v) => (
              <Badge key={v.id} variant="outline" className="border-workspace-panel-border/70 text-[10px]">
                v{v.versionNumber} · {v.sourceType} · {v.modelName}
              </Badge>
            ))}
            {versions.length === 0 && <span className="text-workspace-text-muted">暂无版本记录</span>}
          </div>
          {changedDiff.length > 0 && (
            <div className="mt-2 space-y-1">
              {changedDiff.slice(0, 4).map((f) => (
                <p key={f.field} className="text-[11px]">
                  <span className="font-medium text-workspace-text-primary">{f.label}</span>
                  ：{f.before || '空'} {'->'} {f.after || '空'}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {structured.crossReview && (
        <div className="rounded-md border border-violet-500/25 bg-violet-500/10 p-2">
          <p className="font-medium text-violet-800 dark:text-violet-200">
            多模型交叉评审：{structured.crossReview.status}
            {structured.crossReview.modelName ? ` · ${structured.crossReview.modelName}` : ''}
          </p>
          {structured.crossReview.differences?.length ? (
            <p className="mt-1">{structured.crossReview.differences.slice(0, 3).join('；')}</p>
          ) : null}
          {structured.crossReview.mergedSuggestions?.length ? (
            <p className="mt-1">建议：{structured.crossReview.mergedSuggestions.slice(0, 3).join('；')}</p>
          ) : null}
        </div>
      )}
    </div>
  )
}

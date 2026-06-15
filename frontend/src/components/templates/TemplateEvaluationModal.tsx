import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, CheckCircle2, Gauge, Loader2, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  PromptEvaluationConfidence,
  PromptEvaluationDiagnosticSeverity,
  PromptEvaluationReport,
  TemplateEvaluationJob,
  TemplateEvaluationJobStage,
} from '@/types'
import { tpl } from '@/utils/templatesUi'

function metricText(value: number | null, suffix = '') {
  if (value == null) return '-'
  return `${value}${suffix}`
}

function deltaText(value: number | null, suffix = '') {
  if (value == null) return '-'
  if (value === 0) return `持平`
  return `${value > 0 ? '+' : ''}${value}${suffix}`
}

function checkTone(status: 'pass' | 'warn' | 'fail') {
  if (status === 'pass') return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
  if (status === 'warn') return 'border-amber-400/25 bg-amber-500/10 text-amber-100'
  return 'border-red-400/25 bg-red-500/10 text-red-100'
}

function confidenceTone(confidence: PromptEvaluationConfidence) {
  if (confidence === 'high') return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
  if (confidence === 'medium') return 'border-amber-400/25 bg-amber-500/10 text-amber-100'
  return 'border-red-400/25 bg-red-500/10 text-red-100'
}

function confidenceLabel(confidence: PromptEvaluationConfidence) {
  if (confidence === 'high') return '高'
  if (confidence === 'medium') return '中'
  return '低'
}

function riskTone(severity: PromptEvaluationDiagnosticSeverity) {
  if (severity === 'high') return 'border-red-400/25 bg-red-500/10 text-red-100'
  if (severity === 'medium') return 'border-amber-400/25 bg-amber-500/10 text-amber-100'
  return 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100'
}

function severityLabel(severity: PromptEvaluationDiagnosticSeverity) {
  if (severity === 'high') return '高'
  if (severity === 'medium') return '中'
  return '低'
}

const stageLabels: Record<TemplateEvaluationJobStage, string> = {
  queued: '排队中',
  format_check: '格式体检',
  original_evaluation: '原版样例评测',
  ai_optimization: 'AI 优化 Prompt',
  guardrail_check: '守护校验',
  optimized_evaluation: '优化版样例评测',
  comparison: '指标对比',
  completed: '完成',
  failed: '失败',
  cancelled: '已取消',
}

const orderedStages: TemplateEvaluationJobStage[] = [
  'queued',
  'format_check',
  'original_evaluation',
  'ai_optimization',
  'guardrail_check',
  'optimized_evaluation',
  'comparison',
  'completed',
]

function stageIndex(stage: TemplateEvaluationJobStage) {
  const idx = orderedStages.indexOf(stage)
  return idx < 0 ? 0 : idx
}

export function TemplateEvaluationModal(props: {
  report: PromptEvaluationReport | null
  job?: TemplateEvaluationJob | null
  onClose: () => void
  onCancel?: () => void
}) {
  const { job, onClose, onCancel } = props
  const report = props.report ?? job?.report ?? null
  if (!report && !job) return null
  const running = job?.status === 'queued' || job?.status === 'running'
  const activeStageIndex = job ? stageIndex(job.stage) : orderedStages.length - 1

  return (
    <Dialog.Root open={!!report || !!job} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-confirm-dialog-overlay fixed inset-0 z-[140] motion-reduce:!animate-none" />
        <Dialog.Content
          aria-modal
          role="dialog"
          className="ui-confirm-dialog-layer fixed inset-0 z-[141] outline-none motion-reduce:!animate-none"
          onCloseAutoFocus={(ev) => ev.preventDefault()}
        >
          <div className="ui-template-form-panel pointer-events-auto max-w-4xl">
            <header className="ui-template-form-panel__header flex shrink-0 items-start justify-between gap-3 border-b border-[hsl(var(--templates-panel-border))] px-6 py-4">
              <div className="min-w-0">
                <Dialog.Title className="text-lg font-bold tracking-tight text-[hsl(var(--templates-text-primary))]">
                  Prompt 评测工作台
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[hsl(var(--templates-text-secondary))]">
                  {report
                    ? `${report.templateName} · v${report.templateVersion} · ${report.modelName}`
                    : `${job?.templateName ?? '模板评测'} · v${job?.templateVersion ?? '-'}`}
                </Dialog.Description>
              </div>
              <button type="button" className={tpl.iconBtn} onClick={onClose} aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="ui-template-form-panel__body templates-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {job && (
                <section className="mb-5 rounded-xl border border-[hsl(var(--templates-panel-border))] bg-[hsl(var(--templates-card-bg))] px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {running ? (
                          <Loader2 className="h-4 w-4 animate-spin text-cyan-300 motion-reduce:animate-none" />
                        ) : job.status === 'completed' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-400" />
                        )}
                        <p className="text-sm font-semibold text-[hsl(var(--templates-text-primary))]">
                          {stageLabels[job.stage] ?? job.stage}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-[hsl(var(--templates-text-secondary))]">{job.message}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold tabular-nums text-[hsl(var(--templates-text-primary))]">
                        {job.progress}%
                      </p>
                      <p className="text-xs text-[hsl(var(--templates-text-muted))]">{job.status}</p>
                    </div>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-cyan-400 transition-[width] duration-500"
                      style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }}
                    />
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-4">
                    {orderedStages.map((stage, index) => {
                      const done = index < activeStageIndex || job.status === 'completed'
                      const active = stage === job.stage && running
                      return (
                        <div
                          key={stage}
                          className={[
                            'rounded-lg border px-3 py-2 text-xs',
                            done
                              ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
                              : active
                                ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
                                : 'border-[hsl(var(--templates-panel-border))] bg-black/10 text-[hsl(var(--templates-text-muted))]',
                          ].join(' ')}
                        >
                          {stageLabels[stage]}
                        </div>
                      )
                    })}
                  </div>

                  {job.error && (
                    <div className="mt-3 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-100">
                      {job.error}
                    </div>
                  )}

                  {job.logs.length > 0 && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-xs font-semibold text-cyan-100">查看实时日志</summary>
                      <div className="templates-scrollbar mt-2 max-h-40 overflow-auto rounded-lg bg-black/25 p-3 text-xs leading-relaxed text-[hsl(var(--templates-text-secondary))]">
                        {job.logs.slice(-20).map((line, idx) => (
                          <p key={`${idx}-${line}`}>{line}</p>
                        ))}
                      </div>
                    </details>
                  )}
                </section>
              )}

              {report && (
                <>
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  ['样例数', String(report.sampleCount)],
                  ['解析成功率', metricText(report.parseSuccessRate, '%')],
                  ['平均质量分', metricText(report.averageQualityScore)],
                  ['平均覆盖率', metricText(report.averageCoverageRate, '%')],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-[hsl(var(--templates-panel-border))] bg-[hsl(var(--templates-toolbar-bg))]/70 px-4 py-3"
                  >
                    <p className="text-xs text-[hsl(var(--templates-text-muted))]">{label}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-[hsl(var(--templates-text-primary))]">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {report.diagnostics && (
                <section className="mt-5 rounded-xl border border-[hsl(var(--templates-panel-border))] bg-[hsl(var(--templates-card-bg))] px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Gauge className="h-4 w-4 text-cyan-300" />
                        <p className="text-sm font-semibold text-[hsl(var(--templates-text-primary))]">评测结论</p>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--templates-text-secondary))]">
                        {report.diagnostics.verdict}
                      </p>
                    </div>
                    <div className={`rounded-lg border px-3 py-2 text-xs leading-tight ${confidenceTone(report.diagnostics.confidence)}`}>
                      <p className="opacity-80">可信度</p>
                      <p className="mt-1 text-lg font-semibold">{confidenceLabel(report.diagnostics.confidence)}</p>
                    </div>
                  </div>

                  {report.diagnostics.risks.length > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {report.diagnostics.risks.slice(0, 4).map((risk) => (
                        <div key={risk.id} className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${riskTone(risk.severity)}`}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold">{risk.label}</p>
                            <span className="shrink-0 rounded-full bg-black/20 px-2 py-0.5 text-[10px]">
                              风险 {severityLabel(risk.severity)}
                            </span>
                          </div>
                          <p className="mt-1 opacity-90">{risk.message}</p>
                          {risk.sampleTitles.length > 0 && (
                            <p className="mt-1 truncate opacity-70">影响：{risk.sampleTitles.slice(0, 3).join('、')}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {report.diagnostics.warningGroups.length > 0 && (
                    <div className="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-3 py-2">
                      <p className="text-xs font-semibold text-cyan-100">警告聚合</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {report.diagnostics.warningGroups.slice(0, 4).map((group) => (
                          <div key={group.id} className="text-xs leading-relaxed text-cyan-100/90">
                            <p className="font-medium">
                              {group.label} · {group.count} 次
                            </p>
                            <p className="mt-0.5 text-cyan-100/70">{group.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {report.diagnostics.actions.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-[hsl(var(--templates-text-primary))]">建议动作</p>
                      <ul className="mt-1 space-y-1 text-xs leading-relaxed text-[hsl(var(--templates-text-secondary))]">
                        {report.diagnostics.actions.slice(0, 5).map((action) => (
                          <li key={action}>· {action}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              {report.skippedReason && (
                <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-100">
                  {report.skippedReason}
                </div>
              )}

              {report.promptAnalysis && (
                <section className="mt-5 rounded-xl border border-[hsl(var(--templates-panel-border))] bg-[hsl(var(--templates-card-bg))] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-cyan-300" />
                      <p className="text-sm font-semibold text-[hsl(var(--templates-text-primary))]">Prompt 格式体检</p>
                    </div>
                    <p className="text-xs tabular-nums text-[hsl(var(--templates-text-muted))]">
                      健康度 {report.promptAnalysis.healthScore}
                    </p>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--templates-text-secondary))]">
                    {report.promptAnalysis.summary}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {report.promptAnalysis.checks.map((item) => (
                      <div key={item.id} className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${checkTone(item.status)}`}>
                        <p className="font-semibold">{item.label}</p>
                        <p className="mt-1 opacity-90">{item.message}</p>
                      </div>
                    ))}
                  </div>
                  {(report.promptAnalysis.risks.length > 0 || report.promptAnalysis.suggestions.length > 0) && (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {report.promptAnalysis.risks.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-amber-100">风险</p>
                          <ul className="mt-1 space-y-1 text-xs leading-relaxed text-amber-100/90">
                            {report.promptAnalysis.risks.map((item) => (
                              <li key={item}>· {item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {report.promptAnalysis.suggestions.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-cyan-100">建议</p>
                          <ul className="mt-1 space-y-1 text-xs leading-relaxed text-cyan-100/90">
                            {report.promptAnalysis.suggestions.map((item) => (
                              <li key={item}>· {item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {report.promptOptimization && (
                <section className="mt-5 rounded-xl border border-[hsl(var(--templates-panel-border))] bg-[hsl(var(--templates-card-bg))] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[hsl(var(--templates-text-primary))]">AI 优化建议</p>
                    <p className="text-xs text-[hsl(var(--templates-text-muted))]">
                      {report.promptOptimization.status === 'completed' ? '已生成优化版草稿' : '优化未完成'}
                    </p>
                  </div>
                  {report.promptOptimization.error && (
                    <div className="mt-2 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
                      {report.promptOptimization.error}
                    </div>
                  )}
                  {report.promptOptimization.reasons.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs leading-relaxed text-[hsl(var(--templates-text-secondary))]">
                      {report.promptOptimization.reasons.map((item) => (
                        <li key={item}>· {item}</li>
                      ))}
                    </ul>
                  )}
                  {report.promptOptimization.guardrails.length > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {report.promptOptimization.guardrails.map((item) => (
                        <div key={item.id} className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${checkTone(item.status)}`}>
                          <p className="font-semibold">{item.label}</p>
                          <p className="mt-1 opacity-90">{item.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {report.comparison && report.optimizedEvaluation && (
                    <div className="mt-4 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-2">
                      <p className="text-xs font-semibold text-cyan-100">原版 / AI 优化版评测对比</p>
                      <div className="mt-2 grid gap-2 text-xs text-cyan-100/90 sm:grid-cols-4">
                        <p>解析率 {metricText(report.parseSuccessRate, '%')} → {metricText(report.optimizedEvaluation.parseSuccessRate, '%')}（{deltaText(report.comparison.parseSuccessRateDelta, '%')}）</p>
                        <p>质量 {metricText(report.averageQualityScore)} → {metricText(report.optimizedEvaluation.averageQualityScore)}（{deltaText(report.comparison.averageQualityScoreDelta)}）</p>
                        <p>覆盖 {metricText(report.averageCoverageRate, '%')} → {metricText(report.optimizedEvaluation.averageCoverageRate, '%')}（{deltaText(report.comparison.averageCoverageRateDelta, '%')}）</p>
                        <p>耗时差 {deltaText(report.comparison.totalDurationMsDelta, 'ms')}</p>
                      </div>
                    </div>
                  )}
                  {report.promptOptimization.optimizedContent && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-xs font-semibold text-cyan-100">查看完整优化版 Prompt 草稿</summary>
                      <pre className="templates-scrollbar mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-black/25 p-3 text-xs leading-relaxed text-[hsl(var(--templates-text-secondary))]">
                        {report.promptOptimization.optimizedContent}
                      </pre>
                    </details>
                  )}
                </section>
              )}

              <div className="mt-5 space-y-3">
                {report.samples.map((sample) => (
                  <div
                    key={sample.sampleId}
                    className="rounded-xl border border-[hsl(var(--templates-panel-border))] bg-[hsl(var(--templates-card-bg))] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {sample.parsed ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                        )}
                        <p className="truncate text-sm font-semibold text-[hsl(var(--templates-text-primary))]">
                          {sample.title}
                        </p>
                      </div>
                      <p className="text-xs tabular-nums text-[hsl(var(--templates-text-muted))]">
                        {sample.caseCount} 条 · 质量 {sample.qualityScore} · 覆盖{' '}
                        {metricText(sample.coverageRate, '%')} · {sample.durationMs}ms
                      </p>
                    </div>
                    {(sample.error || sample.warnings.length > 0) && (
                      <div className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
                        {sample.error && <p>{sample.error}</p>}
                        {sample.warnings.slice(0, 3).map((w) => (
                          <p key={w}>{w}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {report.failures.length > 0 && (
                <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-100">失败样例</p>
                  <ul className="mt-2 space-y-1 text-xs text-amber-100/90">
                    {report.failures.map((f) => (
                      <li key={f.sampleId}>
                        {f.title}：{f.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.warningSamples.length > 0 && (
                <div className="mt-5 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-3">
                  <p className="text-sm font-semibold text-cyan-100">警告样例</p>
                  <ul className="mt-2 space-y-1 text-xs text-cyan-100/90">
                    {report.warningSamples.map((f) => (
                      <li key={f.sampleId}>
                        {f.title}：{f.warnings.slice(0, 2).join('；')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
                </>
              )}
            </div>

            <footer className="ui-template-form-panel__footer flex shrink-0 justify-end gap-2 border-t border-[hsl(var(--templates-panel-border))] px-6 py-4">
              {running && onCancel && (
                <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={onCancel}>
                  取消评测
                </Button>
              )}
              <Button type="button" className="h-10 rounded-xl" onClick={onClose}>
                关闭
              </Button>
            </footer>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

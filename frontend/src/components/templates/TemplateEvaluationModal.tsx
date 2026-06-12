import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PromptEvaluationReport } from '@/types'
import { tpl } from '@/utils/templatesUi'

function metricText(value: number | null, suffix = '') {
  if (value == null) return '-'
  return `${value}${suffix}`
}

export function TemplateEvaluationModal(props: {
  report: PromptEvaluationReport | null
  onClose: () => void
}) {
  const { report, onClose } = props
  if (!report) return null

  return (
    <Dialog.Root open={!!report} onOpenChange={(next) => !next && onClose()}>
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
                  Prompt 评测结果
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[hsl(var(--templates-text-secondary))]">
                  {report.templateName} · v{report.templateVersion} · {report.modelName}
                </Dialog.Description>
              </div>
              <button type="button" className={tpl.iconBtn} onClick={onClose} aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="ui-template-form-panel__body templates-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5">
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

              {report.skippedReason && (
                <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-100">
                  {report.skippedReason}
                </div>
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
            </div>

            <footer className="ui-template-form-panel__footer flex shrink-0 justify-end border-t border-[hsl(var(--templates-panel-border))] px-6 py-4">
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

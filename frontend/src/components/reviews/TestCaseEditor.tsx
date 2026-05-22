import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CaseSnapshot } from '@/types/reviews'
import { CASE_PRIORITIES, CASE_TYPE_LABELS, CASE_TYPES, rev } from '@/utils/reviewsUi'

export type TestCaseEditorErrors = Partial<{
  title: string
  steps: string
  expectedResults: string
  priority: string
}>

export function validateCaseSnapshot(s: CaseSnapshot): TestCaseEditorErrors {
  const err: TestCaseEditorErrors = {}
  if (!s.title?.trim()) err.title = '标题不能为空'
  if (!s.steps?.length) err.steps = '至少 1 条步骤'
  else if (s.steps.every((st) => !st.action?.trim())) err.steps = '步骤内容不能为空'
  const exp = s.expectedResults ?? []
  if (!exp.length || exp.every((e) => !e.trim())) err.expectedResults = '至少 1 条预期结果'
  if (!CASE_PRIORITIES.includes(s.priority as (typeof CASE_PRIORITIES)[number])) {
    err.priority = '优先级无效'
  }
  return err
}

export function TestCaseEditor(props: {
  value: CaseSnapshot
  onChange: (next: CaseSnapshot) => void
  errors?: TestCaseEditorErrors
  readOnly?: boolean
}) {
  const { value, onChange, errors, readOnly } = props

  const update = (patch: Partial<CaseSnapshot>) => onChange({ ...value, ...patch })

  const updateStep = (idx: number, patch: Partial<CaseSnapshot['steps'][0]>) => {
    const steps = [...value.steps]
    steps[idx] = { ...steps[idx], ...patch, order: idx + 1 }
    onChange({ ...value, steps })
  }

  const addStep = () => {
    onChange({
      ...value,
      steps: [...value.steps, { order: value.steps.length + 1, action: '', expected: '' }],
    })
  }

  const removeStep = (idx: number) => {
    const steps = value.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 }))
    onChange({ ...value, steps })
  }

  const moveStep = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= value.steps.length) return
    const steps = [...value.steps]
    ;[steps[idx], steps[j]] = [steps[j], steps[idx]]
    onChange({ ...value, steps: steps.map((s, i) => ({ ...s, order: i + 1 })) })
  }

  const updateExpected = (idx: number, text: string) => {
    const expectedResults = [...(value.expectedResults ?? [''])]
    expectedResults[idx] = text
    onChange({ ...value, expectedResults })
  }

  const addExpected = () => {
    onChange({ ...value, expectedResults: [...(value.expectedResults ?? []), ''] })
  }

  const removeExpected = (idx: number) => {
    const expectedResults = (value.expectedResults ?? []).filter((_, i) => i !== idx)
    onChange({ ...value, expectedResults: expectedResults.length ? expectedResults : [''] })
  }

  const tagsStr = (value.tags ?? []).join(', ')

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label
          htmlFor="review-case-title"
          className="mb-1 block text-xs font-medium text-[hsl(var(--review-text-muted))]"
        >
          标题 *
        </label>
        <input
          id="review-case-title"
          className={rev.input}
          value={value.title}
          disabled={readOnly}
          onChange={(e) => update({ title: e.target.value })}
        />
        {errors?.title ? <p className="mt-1 text-xs text-rose-500">{errors.title}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[hsl(var(--review-text-muted))]">
            优先级
          </label>
          <select
            className={rev.input}
            value={value.priority}
            disabled={readOnly}
            onChange={(e) => update({ priority: e.target.value })}
          >
            {CASE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {errors?.priority ? (
            <p className="mt-1 text-xs text-rose-500">{errors.priority}</p>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[hsl(var(--review-text-muted))]">
            类型
          </label>
          <select
            className={rev.input}
            value={value.type}
            disabled={readOnly}
            onChange={(e) => update({ type: e.target.value })}
          >
            {CASE_TYPES.map((t) => (
              <option key={t} value={t}>
                {CASE_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[hsl(var(--review-text-muted))]">
            标签（逗号分隔）
          </label>
          <input
            className={rev.input}
            value={tagsStr}
            disabled={readOnly}
            onChange={(e) =>
              update({
                tags: e.target.value
                  .split(/[,，]/)
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[hsl(var(--review-text-muted))]">
          前置条件
        </label>
        <textarea
          className={rev.input + ' min-h-[72px] resize-y'}
          value={value.precondition ?? ''}
          disabled={readOnly}
          onChange={(e) => update({ precondition: e.target.value })}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-medium text-[hsl(var(--review-text-muted))]">步骤 *</label>
          {!readOnly && (
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addStep}>
              <Plus className="h-3 w-3" />
              添加步骤
            </Button>
          )}
        </div>
        {errors?.steps ? <p className="mb-2 text-xs text-rose-500">{errors.steps}</p> : null}
        <div className="flex flex-col gap-2">
          {value.steps.map((step, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-[hsl(var(--review-border))] bg-[hsl(var(--review-input-bg))] p-3"
            >
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-[hsl(var(--review-text-muted))]">
                步骤 {idx + 1}
                {!readOnly && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
                      disabled={idx === 0}
                      onClick={() => moveStep(idx, -1)}
                      aria-label="上移"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
                      disabled={idx === value.steps.length - 1}
                      onClick={() => moveStep(idx, 1)}
                      aria-label="下移"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-rose-500 hover:bg-rose-500/10"
                      disabled={value.steps.length <= 1}
                      onClick={() => removeStep(idx)}
                      aria-label="删除步骤"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <textarea
                className={rev.input + ' min-h-[56px] resize-y'}
                placeholder="操作步骤"
                value={step.action}
                disabled={readOnly}
                onChange={(e) => updateStep(idx, { action: e.target.value })}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-medium text-[hsl(var(--review-text-muted))]">
            预期结果 *
          </label>
          {!readOnly && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={addExpected}
            >
              <Plus className="h-3 w-3" />
              添加
            </Button>
          )}
        </div>
        {errors?.expectedResults ? (
          <p className="mb-2 text-xs text-rose-500">{errors.expectedResults}</p>
        ) : null}
        <div className="flex flex-col gap-2">
          {(value.expectedResults ?? ['']).map((exp, idx) => (
            <div key={idx} className="flex gap-2">
              <textarea
                className={rev.input + ' min-h-[48px] flex-1 resize-y'}
                placeholder={`预期结果 ${idx + 1}`}
                value={exp}
                disabled={readOnly}
                onChange={(e) => updateExpected(idx, e.target.value)}
              />
              {!readOnly && (value.expectedResults?.length ?? 0) > 1 ? (
                <button
                  type="button"
                  className="mt-2 shrink-0 rounded p-2 text-rose-500 hover:bg-rose-500/10"
                  onClick={() => removeExpected(idx)}
                  aria-label="删除预期"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[hsl(var(--review-text-muted))]">
          备注（可选）
        </label>
        <textarea
          className={rev.input + ' min-h-[56px] resize-y'}
          value={value.remarks ?? ''}
          disabled={readOnly}
          onChange={(e) => update({ remarks: e.target.value })}
        />
      </div>
    </div>
  )
}

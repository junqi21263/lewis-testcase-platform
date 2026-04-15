/**
 * ParseResultPanel —— 单文件解析结果：需求清单 / 原始文本 双 Tab、模板预览、带入生成
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ChevronDown, ChevronUp, Copy, Wand2, ShieldAlert,
  List, Eye, EyeOff, Plus, RefreshCw, Trash2, Combine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import RequirementItem from './RequirementItem'
import { highlightSensitive } from '@/utils/sensitiveDetector'
import { fillPromptTemplate } from '@/utils/fillPromptTemplate'
import type { UploadTask } from '@/types/upload'
import toast from 'react-hot-toast'

type Tab = 'requirements' | 'rawText'

const DEFAULT_TEMPLATE = `请根据以下「结构化需求」设计全面测试用例（含正向、异常与边界）。\n\n{{结构化需求}}\n\n以下为需求原文（供参考）：\n{{需求原文}}`

interface ParseResultPanelProps {
  task: UploadTask
  /** 当前选中的提示词模板正文（解析页下拉框） */
  templateBody: string
  onUpdateRequirement: (taskId: string, pointId: string, content: string) => void
  onDeleteRequirement: (taskId: string, pointId: string) => void
  onAddRequirement: (taskId: string) => void
  onToggleRequirementSelected: (taskId: string, pointId: string, selected: boolean) => void
  onMoveRequirement: (taskId: string, pointId: string, dir: 'up' | 'down') => void
  onSelectAllRequirements: (taskId: string, selected: boolean) => void
  onBatchDeleteSelected: (taskId: string) => void
  onMergeSelectedRequirements: (taskId: string) => void
  onMaskedTextChange: (taskId: string, text: string) => void
  /** 调用后端 /files/:id/restructure */
  onRestructureFromRaw: (taskId: string, text: string) => Promise<void>
  onClearPanel: (taskId: string) => void
  onSendToGenerate: (task: UploadTask) => void
  restructureLoading?: boolean
}

export default function ParseResultPanel({
  task,
  templateBody,
  onUpdateRequirement,
  onDeleteRequirement,
  onAddRequirement,
  onToggleRequirementSelected,
  onMoveRequirement,
  onSelectAllRequirements,
  onBatchDeleteSelected,
  onMergeSelectedRequirements,
  onMaskedTextChange,
  onRestructureFromRaw,
  onClearPanel,
  onSendToGenerate,
  restructureLoading = false,
}: ParseResultPanelProps) {
  const [expanded, setExpanded] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('requirements')
  const [showRaw, setShowRaw] = useState(false)
  const [autoSyncFromRaw, setAutoSyncFromRaw] = useState(true)
  const [rawDraft, setRawDraft] = useState(task.maskedText ?? task.parsedText ?? '')
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>()

  const { requirementPoints, sensitiveMatches, maskedText, file } = task
  const hasSensitive = sensitiveMatches.length > 0

  useEffect(() => {
    setRawDraft(task.maskedText ?? task.parsedText ?? '')
  }, [task.maskedText, task.parsedText])

  const selectedLines = useMemo(
    () => requirementPoints.filter((p) => p.selected && p.content.trim()).map((p) => p.content),
    [requirementPoints],
  )

  const tpl = templateBody.trim() || DEFAULT_TEMPLATE
  const filledPreview = useMemo(
    () => fillPromptTemplate(tpl, selectedLines, rawDraft.trim() || maskedText || ''),
    [tpl, selectedLines, rawDraft, maskedText],
  )

  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label}已复制`)
    } catch {
      toast.error('复制失败')
    }
  }, [])

  const requirementsText = requirementPoints.map((p, i) => `${i + 1}. ${p.content}`).join('\n')

  const highlightedHtml = maskedText
    ? highlightSensitive(maskedText, sensitiveMatches)
    : ''

  const scheduleAutoRestructure = useCallback(
    (text: string) => {
      if (!autoSyncFromRaw || !task.serverFileId) return
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      syncTimerRef.current = setTimeout(() => {
        void onRestructureFromRaw(task.id, text).catch(() => {
          toast.error('自动重新提取失败，可手动点击「重新提取需求」')
        })
      }, 900)
    },
    [autoSyncFromRaw, task.serverFileId, task.id, onRestructureFromRaw],
  )

  const handleRawInput = (v: string) => {
    setRawDraft(v)
    onMaskedTextChange(task.id, v)
    scheduleAutoRestructure(v)
  }

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden transition-all duration-300',
        'bg-card shadow-sm hover:shadow-md',
        hasSensitive ? 'border-orange-200 dark:border-orange-800/50' : 'border-green-200 dark:border-green-800/50',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-semibold text-sm text-foreground truncate max-w-[260px]" title={file.name}>
            {file.name}
          </span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">
            {requirementPoints.length} 条需求
          </span>
          {hasSensitive && (
            <span className="inline-flex items-center gap-1 text-xs text-orange-600 flex-shrink-0">
              <ShieldAlert className="w-3 h-3" />
              {sensitiveMatches.length} 处脱敏
            </span>
          )}
        </div>
        <div className="flex-shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      <div className={cn('overflow-hidden transition-all duration-300', expanded ? 'max-h-[1200px]' : 'max-h-0')}>
        <div className="flex items-center gap-0.5 px-4 pt-1 pb-0 border-t border-border/50">
          <button
            type="button"
            onClick={() => setActiveTab('requirements')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md transition-colors',
              activeTab === 'requirements'
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <List className="w-3.5 h-3.5" />
            需求清单
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rawText')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md transition-colors',
              activeTab === 'rawText'
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            原始文本
          </button>
        </div>

        <div className="px-4 pb-4">
          {activeTab === 'requirements' && (
            <div className="space-y-1 pt-2">
              <div className="flex flex-wrap items-center gap-2 pb-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onSelectAllRequirements(task.id, true)}
                >
                  全选需求
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onSelectAllRequirements(task.id, false)}
                >
                  全不选
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs text-destructive"
                  onClick={() => onBatchDeleteSelected(task.id)}
                >
                  删除已选
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => onMergeSelectedRequirements(task.id)}
                >
                  <Combine className="w-3 h-3" />
                  合并已选
                </Button>
              </div>

              {requirementPoints.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <p>未提取到结构化需求点</p>
                  <p className="text-xs mt-1">可在「原始文本」中编辑并重新提取</p>
                </div>
              ) : (
                requirementPoints.map((point, i) => (
                  <RequirementItem
                    key={point.id}
                    point={point}
                    index={i}
                    onUpdate={(pointId, content) => onUpdateRequirement(task.id, pointId, content)}
                    onDelete={(pointId) => onDeleteRequirement(task.id, pointId)}
                    onToggleSelected={(pointId, sel) =>
                      onToggleRequirementSelected(task.id, pointId, sel)
                    }
                    onMoveUp={(pointId) => onMoveRequirement(task.id, pointId, 'up')}
                    onMoveDown={(pointId) => onMoveRequirement(task.id, pointId, 'down')}
                    disableMoveUp={i === 0}
                    disableMoveDown={i === requirementPoints.length - 1}
                  />
                ))
              )}

              <button
                type="button"
                onClick={() => onAddRequirement(task.id)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-md border border-dashed border-border hover:border-primary/40 transition-all mt-2"
              >
                <Plus className="w-3.5 h-3.5" />
                添加需求点
              </button>
            </div>
          )}

          {activeTab === 'rawText' && (
            <div className="pt-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setShowRaw(!showRaw)}
                >
                  {showRaw ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showRaw ? '显示脱敏' : '显示原文'}
                </Button>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-border accent-primary"
                    checked={autoSyncFromRaw}
                    onChange={(e) => setAutoSyncFromRaw(e.target.checked)}
                  />
                  编辑后自动重新提取
                </label>
              </div>

              <textarea
                className="w-full min-h-[200px] text-xs leading-relaxed bg-muted/40 p-3 rounded-lg border font-mono text-foreground resize-y"
                value={rawDraft}
                onChange={(e) => handleRawInput(e.target.value)}
                placeholder="可粘贴或编辑全文，点击「重新提取需求」更新清单…"
                spellCheck={false}
              />

              {hasSensitive && !showRaw ? (
                <div
                  className="text-xs leading-relaxed bg-muted/20 p-3 rounded-lg max-h-48 overflow-y-auto border"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                />
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  disabled={restructureLoading || !task.serverFileId}
                  onClick={() =>
                    void onRestructureFromRaw(task.id, rawDraft).then(() => toast.success('已重新提取需求'))
                  }
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', restructureLoading && 'animate-spin')} />
                  重新提取需求
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1 text-destructive"
                  onClick={() => {
                    if (confirm('清空本文件的解析文本与需求清单？')) onClearPanel(task.id)
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  清空内容
                </Button>
              </div>
            </div>
          )}

          <div className="mt-3 p-3 rounded-lg border border-dashed border-border/80 bg-muted/20">
            <p className="text-[10px] font-medium text-muted-foreground mb-1">提示词填充预览（随勾选与编辑实时更新）</p>
            <pre className="text-[10px] leading-relaxed whitespace-pre-wrap break-words max-h-32 overflow-y-auto text-muted-foreground">
              {filledPreview.slice(0, 4000)}
              {filledPreview.length > 4000 ? '\n…' : ''}
            </pre>
          </div>

          <div className="flex items-center gap-2 pt-3 mt-3 border-t border-border/50 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => copyText(requirementsText, '需求清单')}
              disabled={requirementPoints.length === 0}
            >
              <Copy className="w-3.5 h-3.5" />
              复制需求清单
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => copyText(maskedText ?? '', '文件内容')}
              disabled={!maskedText}
            >
              <Copy className="w-3.5 h-3.5" />
              复制全文
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 ml-auto"
              onClick={() => onSendToGenerate(task)}
              disabled={selectedLines.length === 0}
            >
              <Wand2 className="w-3.5 h-3.5" />
              带入用例生成
            </Button>
          </div>
        </div>
      </div>

      <style>{`
        .sensitive-highlight {
          background-color: hsl(var(--destructive) / 0.12);
          color: hsl(var(--destructive));
          border-radius: 3px;
          padding: 0 2px;
          font-weight: 600;
          border-bottom: 1.5px dashed hsl(var(--destructive) / 0.6);
          cursor: help;
        }
      `}</style>
    </div>
  )
}

/**
 * ParseResultPanel —— 解析结果：需求清单（统计/快捷键/右键）、原始文本（行号/字数/关键词）
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Wand2,
  ShieldAlert,
  List,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Trash2,
  Combine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import RequirementItem, { type RequirementContextHandlers } from './RequirementItem'
import { highlightSensitive } from '@/utils/sensitiveDetector'
import { fillPromptTemplate } from '@/utils/fillPromptTemplate'
import RawTextEditor from './RawTextEditor'
import type { UploadTask, RequirementPoint } from '@/types/upload'
import toast from 'react-hot-toast'

type Tab = 'requirements' | 'rawText'

const DEFAULT_TEMPLATE = `请根据以下「结构化需求」设计全面测试用例（含正向、异常与边界）。\n\n{{结构化需求}}\n\n以下为需求原文（供参考）：\n{{需求原文}}`

interface ParseResultPanelProps {
  task: UploadTask
  templateBody: string
  onUpdateRequirement: (taskId: string, pointId: string, content: string) => void
  onDeleteRequirement: (taskId: string, pointId: string) => void
  onAddRequirement: (taskId: string) => void
  onToggleRequirementSelected: (taskId: string, pointId: string, selected: boolean) => void
  onMoveRequirement: (taskId: string, pointId: string, dir: 'up' | 'down') => void
  onSelectAllRequirements: (taskId: string, selected: boolean) => void
  onBatchDeleteSelected: (taskId: string) => void
  onMergeSelectedRequirements: (taskId: string) => void
  onPasteAfterRequirement: (taskId: string, afterPointId: string, text: string) => void
  onMergeRequirementWithNext: (taskId: string, pointId: string) => void
  onMaskedTextChange: (taskId: string, text: string) => void
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
  onPasteAfterRequirement,
  onMergeRequirementWithNext,
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
  const [internalClip, setInternalClip] = useState<string | null>(null)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>()
  const listRegionRef = useRef<HTMLDivElement>(null)

  const { requirementPoints, sensitiveMatches, maskedText, file } = task
  const hasSensitive = sensitiveMatches.length > 0

  useEffect(() => {
    setRawDraft(task.maskedText ?? task.parsedText ?? '')
  }, [task.maskedText, task.parsedText])

  const selectedLines = useMemo(
    () => requirementPoints.filter((p) => p.selected && p.content.trim()).map((p) => p.content),
    [requirementPoints],
  )

  const selectedCount = useMemo(
    () => requirementPoints.filter((p) => p.selected && p.content.trim()).length,
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

  const highlightedHtml = maskedText ? highlightSensitive(maskedText, sensitiveMatches) : ''

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

  const makeContext = useCallback(
    (point: RequirementPoint, index: number): RequirementContextHandlers => {
      const pid = point.id
      return {
        onCopy: () => {
          if (point.content) void navigator.clipboard.writeText(point.content).then(() => toast.success('已复制到剪贴板'))
        },
        onCut: () => {
          setInternalClip(point.content)
          onDeleteRequirement(task.id, pid)
          toast.success('已剪切', { duration: 1500 })
        },
        onPasteAfter: () => {
          const text = internalClip?.trim() ?? ''
          if (!text) {
            toast.error('内部剪贴板为空，请先用右键复制或剪切')
            return
          }
          onPasteAfterRequirement(task.id, pid, text)
          toast.success('已粘贴', { duration: 1500 })
        },
        onMergeWithNext: () => {
          onMergeRequirementWithNext(task.id, pid)
          toast.success('已合并', { duration: 1500 })
        },
        onDelete: () => onDeleteRequirement(task.id, pid),
        canPaste: !!internalClip?.trim(),
        hasNext: index < requirementPoints.length - 1,
      }
    },
    [requirementPoints, task.id, internalClip, onDeleteRequirement, onPasteAfterRequirement, onMergeRequirementWithNext],
  )

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      onSelectAllRequirements(task.id, true)
      toast.success('已全选需求', { duration: 1200 })
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      const txt = requirementPoints.filter((p) => p.selected).map((p) => p.content).join('\n')
      if (!txt) {
        toast.error('请先勾选要复制的需求')
        return
      }
      void navigator.clipboard.writeText(txt).then(() => toast.success('已复制选中需求'))
      return
    }
    if (e.key === 'Delete') {
      e.preventDefault()
      const n = requirementPoints.filter((p) => p.selected).length
      if (n === 0) {
        toast.error('请先勾选要删除的需求')
        return
      }
      onBatchDeleteSelected(task.id)
      toast.success(`已删除 ${n} 条`, { duration: 1500 })
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onAddRequirement(task.id)
      toast.success('已新增空白条目', { duration: 1200 })
    }
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
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors active:bg-muted/50"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          <span className="font-semibold text-sm text-foreground truncate max-w-[min(100%,260px)]" title={file.name}>
            {file.name}
          </span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">
            共 {requirementPoints.length} 条 · 已勾选 {selectedCount} 条
          </span>
          {hasSensitive && (
            <span className="inline-flex items-center gap-1 text-xs text-orange-600 flex-shrink-0">
              <ShieldAlert className="w-3 h-3" />
              {sensitiveMatches.length} 处脱敏
            </span>
          )}
        </div>
        <div className="flex-shrink-0 text-muted-foreground transition-transform duration-200">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      <div className={cn('overflow-hidden transition-all duration-300', expanded ? 'max-h-[1400px]' : 'max-h-0')}>
        <div className="flex items-center gap-0.5 px-4 pt-1 pb-0 border-t border-border/50">
          <button
            type="button"
            onClick={() => {
              setActiveTab('requirements')
              requestAnimationFrame(() => listRegionRef.current?.focus())
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md transition-all duration-150',
              activeTab === 'requirements'
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
            )}
          >
            <List className="w-3.5 h-3.5" />
            需求清单
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rawText')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md transition-all duration-150',
              activeTab === 'rawText'
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            原始文本
          </button>
        </div>

        <div className="px-3 sm:px-4 pb-4 min-w-0">
          {activeTab === 'requirements' && (
            <div className="space-y-2 pt-3 min-w-0">
              <p className="text-[11px] text-muted-foreground">
                提示：点击下列区域后可用{' '}
                <kbd className="px-1 py-0.5 rounded border bg-muted font-mono text-[10px]">Ctrl+A</kbd> 全选、
                <kbd className="px-1 py-0.5 rounded border bg-muted font-mono text-[10px]">Ctrl+C</kbd> 复制选中、
                <kbd className="px-1 py-0.5 rounded border bg-muted font-mono text-[10px]">Delete</kbd> 删除选中、
                <kbd className="px-1 py-0.5 rounded border bg-muted font-mono text-[10px]">Enter</kbd> 新增条目；右键单条更多操作。
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs transition-transform active:scale-95"
                  onClick={() => onSelectAllRequirements(task.id, true)}
                >
                  全选需求
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs transition-transform active:scale-95"
                  onClick={() => onSelectAllRequirements(task.id, false)}
                >
                  全不选
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-destructive transition-transform active:scale-95"
                  onClick={() => onBatchDeleteSelected(task.id)}
                >
                  删除已选
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1 transition-transform active:scale-95"
                  onClick={() => onMergeSelectedRequirements(task.id)}
                >
                  <Combine className="w-3 h-3" />
                  合并已选
                </Button>
              </div>

              <div
                ref={listRegionRef}
                tabIndex={0}
                onKeyDown={handleListKeyDown}
                className="min-h-[120px] max-h-[min(60vh,480px)] space-y-1 overflow-y-auto rounded-lg bg-muted/25 p-2 outline-none ring-1 ring-inset ring-foreground/10 backdrop-blur-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 sm:p-3 dark:ring-white/10"
              >
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
                      onToggleSelected={(pointId, sel) => onToggleRequirementSelected(task.id, pointId, sel)}
                      onMoveUp={(pointId) => onMoveRequirement(task.id, pointId, 'up')}
                      onMoveDown={(pointId) => onMoveRequirement(task.id, pointId, 'down')}
                      disableMoveUp={i === 0}
                      disableMoveDown={i === requirementPoints.length - 1}
                      context={makeContext(point, i)}
                    />
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => onAddRequirement(task.id)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs text-muted-foreground ring-2 ring-dashed ring-foreground/15 transition-all hover:bg-primary/5 hover:text-primary hover:ring-primary/35 active:scale-[0.99] dark:ring-white/12"
              >
                <Plus className="w-3.5 h-3.5" />
                添加需求点
              </button>
            </div>
          )}

          {activeTab === 'rawText' && (
            <div className="pt-3 space-y-3 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs gap-1 transition-transform active:scale-95"
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

              <RawTextEditor
                value={rawDraft}
                onChange={handleRawInput}
                placeholder="可粘贴或编辑全文，点击「重新提取需求」更新清单…"
                disabled={restructureLoading}
              />

              {hasSensitive && !showRaw ? (
                <div
                  className="max-h-48 overflow-y-auto rounded-lg bg-muted/25 p-3 text-xs leading-relaxed shadow-sm ring-1 ring-inset ring-foreground/10 backdrop-blur-sm dark:ring-white/10"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                />
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs gap-1 transition-transform active:scale-95"
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
                  className="h-8 text-xs gap-1 text-destructive transition-transform active:scale-95"
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

          <div className="mt-4 rounded-lg bg-muted/25 p-3 ring-2 ring-dashed ring-foreground/15 backdrop-blur-md dark:ring-white/12">
            <p className="text-[10px] font-medium text-muted-foreground mb-1">提示词填充预览（仅含已勾选需求）</p>
            <pre className="text-[10px] leading-relaxed whitespace-pre-wrap break-words max-h-32 overflow-y-auto text-muted-foreground">
              {filledPreview.slice(0, 4000)}
              {filledPreview.length > 4000 ? '\n…' : ''}
            </pre>
          </div>

          <div className="mt-3 flex flex-col items-stretch gap-2 pt-3 shadow-[inset_0_1px_0_0_hsl(var(--border)_/_0.14)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] sm:flex-row sm:items-center">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs gap-1.5 transition-transform active:scale-95"
              onClick={() => copyText(requirementsText, '需求清单')}
              disabled={requirementPoints.length === 0}
            >
              <Copy className="w-3.5 h-3.5" />
              复制需求清单
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs gap-1.5 transition-transform active:scale-95"
              onClick={() => copyText(maskedText ?? '', '文件内容')}
              disabled={!maskedText}
            >
              <Copy className="w-3.5 h-3.5" />
              复制全文
            </Button>
            <Button
              size="sm"
              className="h-9 text-xs gap-1.5 sm:ml-auto transition-transform active:scale-95"
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

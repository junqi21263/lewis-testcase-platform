/**
 * ParseResultPanel —— 单个文件的解析结果面板
 *
 * 布局：折叠面板（Accordion 效果）
 * 内容：
 *   - 脱敏后的原始文本（高亮敏感信息）
 *   - 提取的需求点列表（支持编辑/删除）
 *   - 操作区：复制全文、复制需求点、一键带入生成页
 */

import { useState, useCallback } from 'react'
import {
  ChevronDown, ChevronUp, Copy, Wand2, ShieldAlert,
  List, Eye, EyeOff, Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import RequirementItem from './RequirementItem'
import { highlightSensitive } from '@/utils/sensitiveDetector'
import type { UploadTask } from '@/types/upload'
import toast from 'react-hot-toast'

type Tab = 'requirements' | 'rawText'

interface ParseResultPanelProps {
  task: UploadTask
  /** 更新某条需求点内容 */
  onUpdateRequirement: (taskId: string, pointId: string, content: string) => void
  /** 删除某条需求点 */
  onDeleteRequirement: (taskId: string, pointId: string) => void
  /** 添加空白需求点 */
  onAddRequirement: (taskId: string) => void
  /** 一键带入生成页 */
  onSendToGenerate: (task: UploadTask) => void
}

export default function ParseResultPanel({
  task,
  onUpdateRequirement,
  onDeleteRequirement,
  onAddRequirement,
  onSendToGenerate,
}: ParseResultPanelProps) {
  const [expanded, setExpanded] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('requirements')
  const [showRaw, setShowRaw] = useState(false)

  const { requirementPoints, sensitiveMatches, maskedText, file } = task
  const hasSensitive = sensitiveMatches.length > 0

  /** 复制文本到剪贴板 */
  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label}已复制到剪贴板`)
    } catch {
      toast.error('复制失败，请手动选择复制')
    }
  }, [])

  /** 合并所有需求点为文本 */
  const requirementsText = requirementPoints
    .map((p, i) => `${i + 1}. ${p.content}`)
    .join('\n')

  /** 高亮 HTML（已做 XSS 转义） */
  const highlightedHtml = maskedText
    ? highlightSensitive(maskedText, sensitiveMatches)
    : ''

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden transition-all duration-300',
      'bg-card shadow-sm hover:shadow-md',
      hasSensitive
        ? 'border-orange-200 dark:border-orange-800/50'
        : 'border-green-200 dark:border-green-800/50',
    )}>
      {/* 面板头部（点击折叠/展开） */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* 文件名 */}
          <span className="font-semibold text-sm text-foreground truncate max-w-[260px]" title={file.name}>
            {file.name}
          </span>
          {/* 需求点数量 */}
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">
            {requirementPoints.length} 条需求
          </span>
          {/* 敏感信息提示 */}
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

      {/* 面板内容（折叠动画） */}
      <div className={cn(
        'overflow-hidden transition-all duration-300',
        expanded ? 'max-h-[800px]' : 'max-h-0',
      )}>
        {/* Tab 切换 */}
        <div className="flex items-center gap-0.5 px-4 pt-1 pb-0 border-t border-border/50">
          <button
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
          {/* ---- Tab: 需求清单 ---- */}
          {activeTab === 'requirements' && (
            <div className="space-y-1 pt-2">
              {requirementPoints.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <p>未提取到结构化需求点</p>
                  <p className="text-xs mt-1">可切换到「原始文本」手动复制</p>
                </div>
              ) : (
                requirementPoints.map((point, i) => (
                  <RequirementItem
                    key={point.id}
                    point={point}
                    index={i}
                    onUpdate={(pointId, content) => onUpdateRequirement(task.id, pointId, content)}
                    onDelete={(pointId) => onDeleteRequirement(task.id, pointId)}
                  />
                ))
              )}

              {/* 添加需求点 */}
              <button
                onClick={() => onAddRequirement(task.id)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-md border border-dashed border-border hover:border-primary/40 transition-all mt-2"
              >
                <Plus className="w-3.5 h-3.5" />
                添加需求点
              </button>
            </div>
          )}

          {/* ---- Tab: 原始文本 ---- */}
          {activeTab === 'rawText' && (
            <div className="pt-2 space-y-2">
              {/* 工具栏 */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setShowRaw(!showRaw)}
                >
                  {showRaw ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showRaw ? '显示脱敏' : '显示原文'}
                </Button>
              </div>

              {/* 带高亮的文本框 */}
              {hasSensitive && !showRaw ? (
                <div
                  className="text-xs leading-relaxed bg-muted/40 p-3 rounded-lg max-h-64 overflow-y-auto border font-mono whitespace-pre-wrap break-all"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                />
              ) : (
                <pre className="text-xs leading-relaxed bg-muted/40 p-3 rounded-lg max-h-64 overflow-y-auto border whitespace-pre-wrap break-all font-mono">
                  {showRaw ? task.parsedText : maskedText}
                </pre>
              )}
            </div>
          )}

          {/* ---- 底部操作栏 ---- */}
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
              disabled={requirementPoints.length === 0 && !maskedText}
            >
              <Wand2 className="w-3.5 h-3.5" />
              带入用例生成
            </Button>
          </div>
        </div>
      </div>

      {/* 全局样式（敏感信息高亮） */}
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

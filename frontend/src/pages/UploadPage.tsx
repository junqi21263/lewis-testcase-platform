/**
 * UploadPage —— 多文件上传与智能解析页面
 *
 * 负责：
 * 1. 聚合所有子组件和 Hooks
 * 2. 管理 uploadTasks 状态
 * 3. 协调「带入生成页」的导航逻辑
 */

import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileUp, Info } from 'lucide-react'
import toast from 'react-hot-toast'

import DropZone from '@/components/upload/DropZone'
import FileItemCard from '@/components/upload/FileItemCard'
import ParseResultPanel from '@/components/upload/ParseResultPanel'
import UploadStatsBar from '@/components/upload/UploadStatsBar'
import UploadErrorBoundary from '@/components/upload/UploadErrorBoundary'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useGenerateStore } from '@/store/generateStore'
import type { UploadTask, RequirementPoint } from '@/types/upload'

export default function UploadPage() {
  const navigate = useNavigate()
  const setInputText = useGenerateStore((s) => s.setInputText)
  const setUploadedFile = useGenerateStore((s) => s.setUploadedFile)
  const setSourceType = useGenerateStore((s) => s.setSourceType)

  /** 所有文件任务的状态列表 */
  const [tasks, setTasks] = useState<UploadTask[]>([])

  // ==================== 任务状态更新函数 ====================

  const updateTask = useCallback((id: string, patch: Partial<UploadTask>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    )
  }, [])

  const addTask = useCallback((task: UploadTask) => {
    setTasks((prev) => [task, ...prev])
  }, [])

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // ==================== 上传 Hook ====================

  const { addFiles, pauseUpload, resumeUpload, cancelUpload, retryUpload } = useFileUpload({
    onTaskUpdate: updateTask,
    onTaskAdd: addTask,
    onTaskRemove: removeTask,
  })

  // ==================== 文件选择 ====================

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      const rejected = addFiles(files)
      rejected.forEach(({ file, reason }) => {
        toast.error(`「${file.name}」${reason}`, { duration: 4000 })
      })
    },
    [addFiles],
  )

  // ==================== 批量操作 ====================

  const handleClearAll = useCallback(() => {
    if (!confirm('确认清除所有文件？正在上传的任务将被取消。')) return
    tasks.forEach((t) => cancelUpload(t))
    setTasks([])
  }, [tasks, cancelUpload])

  const handleClearDone = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status !== 'parsed'))
  }, [])

  // ==================== 需求点 CRUD ====================

  const handleUpdateRequirement = useCallback(
    (taskId: string, pointId: string, content: string) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t
          return {
            ...t,
            requirementPoints: t.requirementPoints.map((p) =>
              p.id === pointId ? { ...p, content, edited: true } : p,
            ),
          }
        }),
      )
    },
    [],
  )

  const handleDeleteRequirement = useCallback(
    (taskId: string, pointId: string) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t
          return {
            ...t,
            requirementPoints: t.requirementPoints.filter((p) => p.id !== pointId),
          }
        }),
      )
    },
    [],
  )

  const handleAddRequirement = useCallback((taskId: string) => {
    const newPoint: RequirementPoint = {
      id: crypto.randomUUID(),
      content: '',
      originalContent: '',
      edited: false,
      sourceFile: tasks.find((t) => t.id === taskId)?.file.name ?? '',
    }
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t
        return { ...t, requirementPoints: [...t.requirementPoints, newPoint] }
      }),
    )
  }, [tasks])

  // ==================== 带入生成页 ====================

  const handleSendToGenerate = useCallback(
    (task: UploadTask) => {
      const requirementsText = task.requirementPoints.length > 0
        ? task.requirementPoints.map((p, i) => `${i + 1}. ${p.content}`).join('\n')
        : task.maskedText ?? ''

      if (!requirementsText.trim()) {
        toast.error('暂无可用内容，请等待解析完成')
        return
      }

      if (task.serverFileId) {
        // 优先以文件模式带入（保留服务端文件引用）
        setSourceType('file')
        setUploadedFile({
          id: task.serverFileId,
          name: task.file.name,
          originalName: task.file.name,
          size: task.file.size,
          mimeType: task.file.type,
          fileType: 'TEXT',
          status: 'PARSED',
          parsedContent: requirementsText,
          uploaderId: '',
          createdAt: new Date().toISOString(),
        })
      } else {
        // 以文本模式带入
        setSourceType('text')
        setInputText(requirementsText)
      }

      toast.success('内容已带入生成页，跳转中...')
      navigate('/generate')
    },
    [setSourceType, setUploadedFile, setInputText, navigate],
  )

  // ==================== 统计数据 ====================

  const stats = useMemo(() => ({
    total: tasks.length,
    uploading: tasks.filter((t) => t.status === 'uploading' || t.status === 'parsing').length,
    parsed: tasks.filter((t) => t.status === 'parsed').length,
    error: tasks.filter((t) => t.status === 'error').length,
  }), [tasks])

  /** 已解析完成的任务（用于展示解析结果面板） */
  const parsedTasks = useMemo(() => tasks.filter((t) => t.status === 'parsed'), [tasks])

  /** 未完成的任务（上传列表） */
  const pendingTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'parsed'),
    [tasks],
  )

  return (
    <UploadErrorBoundary>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 页面标题 */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileUp className="w-6 h-6 text-primary" />
              文档上传与解析
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              上传需求文档，AI 自动解析内容并提取需求点，支持 OCR 识别与敏感信息脱敏
            </p>
          </div>
        </div>

        {/* 使用提示 */}
        <div className="flex items-start gap-2.5 px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg text-sm text-blue-700 dark:text-blue-300">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-medium">使用说明</p>
            <p className="text-xs opacity-80">
              支持 DOC/DOCX/PDF/TXT/MD/XLSX/JSON/YAML 文档解析，以及 PNG/JPG 图片 OCR 识别。
              解析完成后可编辑需求点，点击「带入用例生成」自动跳转到生成页。
            </p>
          </div>
        </div>

        {/* 拖拽上传区 */}
        <DropZone
          onFilesSelected={handleFilesSelected}
          fileCount={tasks.length}
          disabled={false}
        />

        {/* 统计栏 */}
        <UploadStatsBar
          stats={stats}
          onClearAll={handleClearAll}
          onClearDone={handleClearDone}
        />

        {/* 上传任务列表（pending/uploading/error/paused） */}
        {pendingTasks.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground px-0.5">
              上传队列 ({pendingTasks.length})
            </h2>
            <div className="space-y-2">
              {pendingTasks.map((task) => (
                <FileItemCard
                  key={task.id}
                  task={task}
                  onPause={(t) => pauseUpload(t.id)}
                  onResume={(t) => resumeUpload(t)}
                  onRetry={(t) => retryUpload(t)}
                  onCancel={(t) => cancelUpload(t)}
                  onViewResult={(t) => {
                    // 滚动到对应的解析结果面板
                    document.getElementById(`parse-${t.id}`)?.scrollIntoView({
                      behavior: 'smooth', block: 'start',
                    })
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* 解析结果区 */}
        {parsedTasks.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground px-0.5">
              解析结果 ({parsedTasks.length} 个文件)
            </h2>
            <div className="space-y-3">
              {parsedTasks.map((task) => (
                <div key={task.id} id={`parse-${task.id}`}>
                  <ParseResultPanel
                    task={task}
                    onUpdateRequirement={handleUpdateRequirement}
                    onDeleteRequirement={handleDeleteRequirement}
                    onAddRequirement={handleAddRequirement}
                    onSendToGenerate={handleSendToGenerate}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 空状态 */}
        {tasks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <p>还没有上传任何文件，拖入或点击上方区域开始</p>
          </div>
        )}
      </div>
    </UploadErrorBoundary>
  )
}

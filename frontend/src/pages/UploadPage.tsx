/**
 * UploadPage —— 文档解析：多文件队列上传、结构化需求编辑、模板嵌入、带入生成
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileUp, Info, History } from 'lucide-react'
import toast from 'react-hot-toast'

import DropZone from '@/components/upload/DropZone'
import FileItemCard from '@/components/upload/FileItemCard'
import ParseResultPanel from '@/components/upload/ParseResultPanel'
import UploadStatsBar from '@/components/upload/UploadStatsBar'
import UploadErrorBoundary from '@/components/upload/UploadErrorBoundary'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useGenerateStore } from '@/store/generateStore'
import type { UploadTask, RequirementPoint } from '@/types/upload'
import type { PromptTemplate } from '@/types'
import { templatesApi } from '@/api/templates'
import { documentParseApi, type DocumentParseRecord } from '@/api/documentParse'
import { filesApi } from '@/api/files'
import { fillPromptTemplate } from '@/utils/fillPromptTemplate'
import { detectSensitive, maskText } from '@/utils/sensitiveDetector'

const DRAFT_KEY = 'document-parse-draft-v1'

const DEFAULT_TEMPLATE = `请根据以下「结构化需求」设计全面测试用例（含正向、异常与边界）。\n\n{{结构化需求}}\n\n以下为需求原文（供参考）：\n{{需求原文}}`

function rebuildMaskedFromPoints(points: RequirementPoint[]): string {
  return points.map((p, i) => `${i + 1}. ${p.content}`).join('\n')
}

export default function UploadPage() {
  const navigate = useNavigate()
  const setPendingGenerateHandoff = useGenerateStore((s) => s.setPendingGenerateHandoff)

  const [tasks, setTasks] = useState<UploadTask[]>([])
  const [templateOptions, setTemplateOptions] = useState<PromptTemplate[]>([])
  const [parseTemplateId, setParseTemplateId] = useState<string | null>(null)
  const [parseTemplateContent, setParseTemplateContent] = useState('')
  const [history, setHistory] = useState<DocumentParseRecord[]>([])
  const [restructureLoading, setRestructureLoading] = useState<Record<string, boolean>>({})

  const updateTask = useCallback((id: string, patch: Partial<UploadTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const addTask = useCallback((task: UploadTask) => {
    setTasks((prev) => [task, ...prev])
  }, [])

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const { addFiles, pauseUpload, resumeUpload, cancelUpload, retryUpload } = useFileUpload({
    onTaskUpdate: updateTask,
    onTaskAdd: addTask,
    onTaskRemove: removeTask,
  })

  useEffect(() => {
    let c = false
    templatesApi
      .getTemplates({ page: 1, pageSize: 100 })
      .then((res) => {
        if (!c) setTemplateOptions(res.list)
      })
      .catch(() => {})
    return () => {
      c = true
    }
  }, [])

  useEffect(() => {
    let c = false
    documentParseApi
      .recent(10)
      .then((rows) => {
        if (!c) setHistory(rows)
      })
      .catch(() => {})
    return () => {
      c = true
    }
  }, [tasks.length])

  /** 恢复未完成草稿（无 File 对象，仅已解析内容） */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw || tasks.length > 0) return
      const draft = JSON.parse(raw) as {
        v: number
        parseTemplateId: string | null
        tasks: Array<{
          id: string
          fileName: string
          serverFileId?: string
          requirementPoints: RequirementPoint[]
          maskedText?: string
          parsedText?: string
          status: UploadTask['status']
        }>
      }
      if (draft.v !== 1 || !Array.isArray(draft.tasks) || draft.tasks.length === 0) return
      setParseTemplateId(draft.parseTemplateId)
      void (async () => {
        const restored: UploadTask[] = []
        for (const d of draft.tasks) {
          let masked = d.maskedText ?? ''
          let points = d.requirementPoints ?? []
          let parsedText = d.parsedText ?? ''
          if (d.serverFileId) {
            try {
              const f = await filesApi.getFileById(d.serverFileId)
              parsedText = f.parsedContent ?? parsedText
              const sens = detectSensitive(parsedText)
              masked = maskText(parsedText, sens)
              const struct = Array.isArray(f.structuredRequirements) ? f.structuredRequirements : []
              if (struct.length > 0) {
                points = struct.map((content) => ({
                  id: crypto.randomUUID(),
                  content,
                  originalContent: content,
                  edited: false,
                  sourceFile: d.fileName,
                  selected: true,
                }))
              }
            } catch {
              /* 保持草稿 */
            }
          }
          const blob = new Blob([], { type: 'application/octet-stream' })
          const pseudoFile = new File([blob], d.fileName, { lastModified: Date.now() })
          restored.push({
            id: d.id,
            file: pseudoFile,
            progress: 100,
            status: d.status === 'parsed' ? 'parsed' : 'error',
            serverFileId: d.serverFileId,
            requirementPoints: points,
            sensitiveMatches: detectSensitive(parsedText),
            maskedText: masked,
            parsedText,
          })
        }
        setTasks(restored)
        toast.success('已恢复上次未完成的解析草稿')
      })()
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅首屏尝试恢复
  }, [])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        const serializable = tasks.map((t) => ({
          id: t.id,
          fileName: t.file.name,
          serverFileId: t.serverFileId,
          requirementPoints: t.requirementPoints,
          maskedText: t.maskedText,
          parsedText: t.parsedText,
          status: t.status,
        }))
        if (serializable.length === 0) {
          localStorage.removeItem(DRAFT_KEY)
          return
        }
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ v: 1, parseTemplateId, tasks: serializable }),
        )
      } catch {
        /* quota */
      }
    }, 500)
    return () => clearTimeout(handle)
  }, [tasks, parseTemplateId])

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      const rejected = addFiles(files)
      rejected.forEach(({ file, reason }) => {
        toast.error(`「${file.name}」${reason}`, { duration: 4000 })
      })
    },
    [addFiles],
  )

  const handleClearAll = useCallback(() => {
    if (!confirm('确认清除所有文件？正在上传的任务将被取消。')) return
    tasks.forEach((t) => cancelUpload(t))
    setTasks([])
    localStorage.removeItem(DRAFT_KEY)
  }, [tasks, cancelUpload])

  const handleClearDone = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status !== 'parsed'))
  }, [])

  const handleUpdateRequirement = useCallback((taskId: string, pointId: string, content: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t
        const requirementPoints = t.requirementPoints.map((p) =>
          p.id === pointId ? { ...p, content, edited: true } : p,
        )
        const maskedText = rebuildMaskedFromPoints(requirementPoints)
        return { ...t, requirementPoints, maskedText }
      }),
    )
  }, [])

  const handleDeleteRequirement = useCallback((taskId: string, pointId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t
        const requirementPoints = t.requirementPoints.filter((p) => p.id !== pointId)
        const maskedText = rebuildMaskedFromPoints(requirementPoints)
        return { ...t, requirementPoints, maskedText }
      }),
    )
  }, [])

  const handleAddRequirement = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t
        const newPoint: RequirementPoint = {
          id: crypto.randomUUID(),
          content: '',
          originalContent: '',
          edited: false,
          sourceFile: t.file.name,
          selected: true,
        }
        const requirementPoints = [...t.requirementPoints, newPoint]
        return { ...t, requirementPoints }
      }),
    )
  }, [])

  const handleToggleRequirementSelected = useCallback(
    (taskId: string, pointId: string, selected: boolean) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t
          return {
            ...t,
            requirementPoints: t.requirementPoints.map((p) =>
              p.id === pointId ? { ...p, selected } : p,
            ),
          }
        }),
      )
    },
    [],
  )

  const handleMoveRequirement = useCallback(
    (taskId: string, pointId: string, dir: 'up' | 'down') => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t
          const idx = t.requirementPoints.findIndex((p) => p.id === pointId)
          if (idx < 0) return t
          const j = dir === 'up' ? idx - 1 : idx + 1
          if (j < 0 || j >= t.requirementPoints.length) return t
          const next = [...t.requirementPoints]
          const tmp = next[idx]
          next[idx] = next[j]!
          next[j] = tmp!
          return { ...t, requirementPoints: next, maskedText: rebuildMaskedFromPoints(next) }
        }),
      )
    },
    [],
  )

  const handleSelectAllRequirements = useCallback((taskId: string, selected: boolean) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, requirementPoints: t.requirementPoints.map((p) => ({ ...p, selected })) }
          : t,
      ),
    )
  }, [])

  const handleBatchDeleteSelected = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t
        const requirementPoints = t.requirementPoints.filter((p) => !p.selected)
        return { ...t, requirementPoints, maskedText: rebuildMaskedFromPoints(requirementPoints) }
      }),
    )
  }, [])

  const handleMergeSelectedRequirements = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t
        const sel = t.requirementPoints.filter((p) => p.selected)
        if (sel.length < 2) {
          toast.error('请至少勾选两条需求以合并')
          return t
        }
        const mergedContent = sel.map((p) => p.content).join('；')
        const rest = t.requirementPoints.filter((p) => !p.selected)
        const newPoint: RequirementPoint = {
          id: crypto.randomUUID(),
          content: mergedContent,
          originalContent: mergedContent,
          edited: true,
          sourceFile: t.file.name,
          selected: true,
        }
        const requirementPoints = [...rest, newPoint]
        return { ...t, requirementPoints, maskedText: rebuildMaskedFromPoints(requirementPoints) }
      }),
    )
  }, [])

  const handlePasteAfterRequirement = useCallback((taskId: string, afterPointId: string, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t
        const idx = t.requirementPoints.findIndex((p) => p.id === afterPointId)
        const newPoint: RequirementPoint = {
          id: crypto.randomUUID(),
          content: trimmed,
          originalContent: trimmed,
          edited: false,
          sourceFile: t.file.name,
          selected: true,
        }
        const next = [...t.requirementPoints]
        const insertAt = idx >= 0 ? idx + 1 : next.length
        next.splice(insertAt, 0, newPoint)
        return { ...t, requirementPoints: next, maskedText: rebuildMaskedFromPoints(next) }
      }),
    )
  }, [])

  const handleMergeRequirementWithNext = useCallback((taskId: string, pointId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t
        const idx = t.requirementPoints.findIndex((p) => p.id === pointId)
        if (idx < 0 || idx >= t.requirementPoints.length - 1) {
          toast.error('没有下一条可合并')
          return t
        }
        const a = t.requirementPoints[idx]!
        const b = t.requirementPoints[idx + 1]!
        const mergedContent = `${a.content}；${b.content}`
        const newPoint: RequirementPoint = {
          id: crypto.randomUUID(),
          content: mergedContent,
          originalContent: mergedContent,
          edited: true,
          sourceFile: t.file.name,
          selected: true,
        }
        const next = [...t.requirementPoints]
        next.splice(idx, 2, newPoint)
        return { ...t, requirementPoints: next, maskedText: rebuildMaskedFromPoints(next) }
      }),
    )
  }, [])

  const handleMaskedTextChange = useCallback((taskId: string, text: string) => {
    const sens = detectSensitive(text)
    const maskedText = maskText(text, sens)
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, maskedText, sensitiveMatches: sens } : t)),
    )
  }, [])

  const handleRestructureFromRaw = useCallback(async (taskId: string, text: string) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task?.serverFileId) {
      toast.error('缺少服务端文件，无法重新结构化')
      return
    }
    setRestructureLoading((m) => ({ ...m, [taskId]: true }))
    try {
      const file = await filesApi.restructure(task.serverFileId, text)
      const parsedText = file.parsedContent ?? ''
      const sens = detectSensitive(parsedText)
      const maskedText = maskText(parsedText, sens)
      const struct = Array.isArray(file.structuredRequirements) ? file.structuredRequirements : []
      const nextPoints: RequirementPoint[] =
        struct.length > 0
          ? struct.map((content) => ({
              id: crypto.randomUUID(),
              content: content.trim(),
              originalContent: content.trim(),
              edited: false,
              sourceFile: task.file.name,
              selected: true,
            }))
          : task.requirementPoints
      if (struct.length === 0) {
        toast.error('未提取到新的需求条目，请检查原文')
      }
      updateTask(taskId, {
        parsedText,
        maskedText,
        sensitiveMatches: sens,
        requirementPoints: nextPoints,
      })
    } finally {
      setRestructureLoading((m) => ({ ...m, [taskId]: false }))
    }
  }, [tasks, updateTask])

  const handleClearPanel = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, requirementPoints: [], maskedText: '', parsedText: '', sensitiveMatches: [] }
          : t,
      ),
    )
  }, [])

  const stats = useMemo(
    () => ({
      total: tasks.length,
      uploading: tasks.filter((t) => t.status === 'uploading' || t.status === 'parsing').length,
      parsed: tasks.filter((t) => t.status === 'parsed').length,
      error: tasks.filter((t) => t.status === 'error').length,
    }),
    [tasks],
  )

  const parsedTasks = useMemo(() => tasks.filter((t) => t.status === 'parsed'), [tasks])
  const pendingTasks = useMemo(() => tasks.filter((t) => t.status !== 'parsed'), [tasks])

  const activeTransfer = useMemo(() => {
    const t = tasks.find((x) => x.status === 'uploading' || x.status === 'parsing')
    if (!t) return null
    return {
      fileName: t.file.name,
      progress: t.progress,
      phase: t.status === 'uploading' ? ('uploading' as const) : ('parsing' as const),
    }
  }, [tasks])

  const tplBody = parseTemplateContent.trim() || DEFAULT_TEMPLATE

  const sendPayload = useCallback(
    async (opts: { task: UploadTask } | { tasks: UploadTask[] }) => {
      const list = 'tasks' in opts ? opts.tasks : [opts.task]
      const selectedLines = list.flatMap((t) =>
        t.requirementPoints
          .filter((p) => p.selected && p.content.trim())
          .map((p) => (list.length > 1 ? `[${t.file.name}] ${p.content}` : p.content)),
      )
      if (selectedLines.length === 0) {
        toast.error('请至少勾选一条有效需求')
        return
      }
      const raw = list.map((t) => `【${t.file.name}】\n${t.maskedText ?? t.parsedText ?? ''}`).join('\n\n---\n\n')
      const filled = fillPromptTemplate(tplBody, selectedLines, raw)
      try {
        const record = await documentParseApi.create({
          title: `文档解析 ${new Date().toLocaleString('zh-CN')}`,
          rawText: raw,
          requirements: list.flatMap((t) =>
            t.requirementPoints.map((p) => ({
              id: p.id,
              content: p.content,
              selected: p.selected,
              sourceFile: t.file.name,
            })),
          ),
          filledPrompt: filled,
          templateId: parseTemplateId ?? undefined,
          fileIds: list.map((t) => t.serverFileId).filter((x): x is string => Boolean(x)),
        })
        setPendingGenerateHandoff({
          filledPrompt: filled,
          templateId: parseTemplateId,
          parseRecordId: record.id,
          fileIds: record.fileIds,
          rawText: raw,
        })
        toast.success('已保存解析记录，跳转生成页…')
        navigate('/generate')
      } catch {
        toast.error('保存解析记录失败，请稍后重试')
      }
    },
    [navigate, parseTemplateId, setPendingGenerateHandoff, tplBody],
  )

  const handleSendToGenerate = useCallback(
    (task: UploadTask) => {
      void sendPayload({ task })
    },
    [sendPayload],
  )

  const handleMergeSendToGenerate = useCallback(() => {
    if (parsedTasks.length === 0) return
    void sendPayload({ tasks: parsedTasks })
  }, [parsedTasks, sendPayload])

  const applyHistoryRecord = useCallback((rec: DocumentParseRecord) => {
    setParseTemplateId(rec.templateId)
    const t = templateOptions.find((x) => x.id === rec.templateId)
    setParseTemplateContent(t?.content ?? '')
    toast.success(`已载入历史：${rec.title}`)
    const blob = new Blob([], { type: 'application/octet-stream' })
    const pseudoFile = new File([blob], rec.title, { lastModified: Date.now() })
    const points: RequirementPoint[] = (rec.requirements ?? []).map((r) => ({
      id: r.id || crypto.randomUUID(),
      content: r.content,
      originalContent: r.content,
      edited: false,
      sourceFile: r.sourceFile || rec.title,
      selected: r.selected !== false,
    }))
    setTasks([
      {
        id: crypto.randomUUID(),
        file: pseudoFile,
        progress: 100,
        status: 'parsed',
        requirementPoints: points,
        sensitiveMatches: detectSensitive(rec.rawText),
        maskedText: rec.rawText,
        parsedText: rec.rawText,
      },
    ])
  }, [templateOptions])

  return (
    <UploadErrorBoundary>
      <div className="w-full min-w-0 max-w-4xl mx-auto px-3 sm:px-4 md:px-6 pb-8 space-y-6 md:space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileUp className="w-6 h-6 text-primary" />
              文档上传与解析
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              多文件队列解析、脱敏与结构化需求提取；选择模板后一键带入用例生成
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg text-sm text-blue-700 dark:text-blue-300">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-medium">使用说明</p>
            <p className="text-xs opacity-80">
              支持 DOC/DOCX/PDF/TXT/MD/XLSX/JSON/YAML 与 PNG/JPG。多文件将<strong>串行</strong>
              完成上传与解析。需求清单可勾选、排序、合并；原始文本支持重新提取。模板中可使用
              {' {{结构化需求}} '}与{' {{需求原文}} '}占位符。
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">用例生成模板</label>
            <select
              className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm min-w-0"
              value={parseTemplateId ?? ''}
              onChange={(e) => {
                const id = e.target.value
                if (!id) {
                  setParseTemplateId(null)
                  setParseTemplateContent('')
                  return
                }
                const t = templateOptions.find((x) => x.id === id)
                if (t) {
                  setParseTemplateId(id)
                  setParseTemplateContent(t.content)
                  toast.success(`已选择模板：${t.name}`)
                }
              }}
            >
              <option value="">— 使用默认嵌入模板 —</option>
              {templateOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {parsedTasks.length > 1 && (
            <button
              type="button"
              onClick={handleMergeSendToGenerate}
              className="w-full sm:w-auto text-sm font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90"
            >
              合并全部已解析文件的需求并带入生成
            </button>
          )}
        </div>

        {history.length > 0 && (
          <div className="rounded-xl border bg-card/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <History className="w-4 h-4" />
              最近解析记录
            </div>
            <ul className="space-y-1.5 max-h-40 overflow-y-auto text-xs">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground">{h.title}</span>
                  <button
                    type="button"
                    className="text-primary hover:underline flex-shrink-0"
                    onClick={() => applyHistoryRecord(h)}
                  >
                    复用
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DropZone
          onFilesSelected={handleFilesSelected}
          fileCount={tasks.length}
          disabled={false}
          activeTransfer={activeTransfer}
        />

        <UploadStatsBar stats={stats} onClearAll={handleClearAll} onClearDone={handleClearDone} />

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
                    document.getElementById(`parse-${t.id}`)?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    })
                  }}
                />
              ))}
            </div>
          </div>
        )}

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
                    templateBody={tplBody}
                    onUpdateRequirement={handleUpdateRequirement}
                    onDeleteRequirement={handleDeleteRequirement}
                    onAddRequirement={handleAddRequirement}
                    onToggleRequirementSelected={handleToggleRequirementSelected}
                    onMoveRequirement={handleMoveRequirement}
                    onSelectAllRequirements={handleSelectAllRequirements}
                    onBatchDeleteSelected={handleBatchDeleteSelected}
                    onMergeSelectedRequirements={handleMergeSelectedRequirements}
                    onPasteAfterRequirement={handlePasteAfterRequirement}
                    onMergeRequirementWithNext={handleMergeRequirementWithNext}
                    onMaskedTextChange={handleMaskedTextChange}
                    onRestructureFromRaw={handleRestructureFromRaw}
                    onClearPanel={handleClearPanel}
                    onSendToGenerate={handleSendToGenerate}
                    restructureLoading={!!restructureLoading[task.id]}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {tasks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <p>还没有上传任何文件，拖入或点击上方区域开始</p>
          </div>
        )}
      </div>
    </UploadErrorBoundary>
  )
}

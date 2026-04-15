/**
 * useFileUpload —— 多文件上传与解析
 * - 校验格式与大小
 * - 队列串行：逐个完成「上传 → 解析」再处理下一个
 * - 图片自动压缩后上传
 * - 解析结果优先使用后端 structuredRequirements
 */

import { useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { filesApi, CHUNK_THRESHOLD, CHUNK_SIZE } from '@/api/files'
import { detectSensitive, maskText } from '@/utils/sensitiveDetector'
import { extractRequirements } from '@/utils/requirementExtractor'
import { compressImageIfNeeded } from '@/utils/imageCompress'
import type { UploadTask, SupportedExtension, RequirementPoint } from '@/types/upload'
import type { UploadedFile } from '@/types'

const SUPPORTED_EXTS = new Set<string>([
  'doc', 'docx', 'pdf', 'txt', 'md', 'xlsx', 'json', 'yaml', 'yml', 'png', 'jpg', 'jpeg',
])

/** 与后端 `ParseFilePipe` / `MAX_FILE_SIZE`（默认 10MB）一致 */
const MAX_FILE_SIZE = 10 * 1024 * 1024
const POLL_INTERVAL_MS = 2000
const POLL_MAX_ROUNDS = 90

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function normalizeStructured(raw: unknown): string[] {
  if (!raw || !Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
}

function serverFileToRequirementPoints(file: UploadedFile, sourceName: string): RequirementPoint[] {
  const text = file.parsedContent ?? ''
  const structured = normalizeStructured(file.structuredRequirements)
  const sensitiveMatches = detectSensitive(text)
  const maskedText = maskText(text, sensitiveMatches)

  if (structured.length > 0) {
    return structured.map((content) => ({
      id: crypto.randomUUID(),
      content: content.trim(),
      originalContent: content.trim(),
      edited: false,
      sourceFile: sourceName,
      selected: true,
    }))
  }

  return extractRequirements(maskedText, sourceName)
}

function parseErrorHint(msg: string): string {
  if (/超时/i.test(msg)) return '可稍后点击「重试」，或尝试较小文件。'
  if (/分片|merge|上传失败/i.test(msg)) return '大文件分片上传可能未配置服务端，请使用较小文件或联系管理员。'
  if (/解析失败|损坏|无法|为空/i.test(msg)) return '请检查文件是否加密/损坏，或更换格式后重试。'
  if (/视觉|OCR|未配置/i.test(msg)) return '请在系统设置中配置支持视觉的模型，或改用文本需求。'
  return '请检查网络、默认模型与 API Key；仍失败可更换文件重试。'
}

async function pollUntilParsed(serverFileId: string): Promise<UploadedFile> {
  for (let i = 0; i < POLL_MAX_ROUNDS; i++) {
    await sleep(POLL_INTERVAL_MS)
    const file = await filesApi.getFileById(serverFileId)
    if (file.status === 'PARSED' && (file.parsedContent?.trim() || normalizeStructured(file.structuredRequirements).length > 0)) {
      return file
    }
    if (file.status === 'FAILED') {
      throw new Error(file.parseError?.trim() || '服务端解析失败')
    }
  }
  throw new Error('解析超时，请稍后重试')
}

type UpdateTaskFn = (id: string, patch: Partial<UploadTask>) => void

interface UseFileUploadOptions {
  onTaskUpdate: UpdateTaskFn
  onTaskAdd: (task: UploadTask) => void
  onTaskRemove: (id: string) => void
}

export function useFileUpload({ onTaskUpdate, onTaskAdd, onTaskRemove }: UseFileUploadOptions) {
  const controllersRef = useRef<Map<string, AbortController>>(new Map())
  /** 串行管道：保证多文件按队列逐个完成上传+解析 */
  const pipelineTailRef = useRef<Promise<void>>(Promise.resolve())

  const validateFile = useCallback((file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!SUPPORTED_EXTS.has(ext as SupportedExtension)) {
      return `不支持的文件格式 .${ext}，请上传 DOC/DOCX/PDF/TXT/MD/XLSX/JSON/YAML/PNG/JPG`
    }
    if (file.size > MAX_FILE_SIZE) {
      return `文件过大（${(file.size / 1024 / 1024).toFixed(1)} MB），单文件不超过 10 MB`
    }
    return null
  }, [])

  const initTask = useCallback(
    (file: File): UploadTask => {
      const task: UploadTask = {
        id: crypto.randomUUID(),
        file,
        progress: 0,
        status: 'idle',
        requirementPoints: [],
        sensitiveMatches: [],
      }
      onTaskAdd(task)
      return task
    },
    [onTaskAdd],
  )

  const applyParsed = useCallback(
    (taskId: string, server: UploadedFile, displayFile: File) => {
      const points = serverFileToRequirementPoints(server, displayFile.name)
      const text = server.parsedContent ?? ''
      const sensitiveMatches = detectSensitive(text)
      const maskedText = maskText(text, sensitiveMatches)
      onTaskUpdate(taskId, {
        status: 'parsed',
        parsedText: text,
        maskedText,
        sensitiveMatches,
        requirementPoints: points,
        progress: 100,
        pollingTimer: undefined,
      })
      toast.success(`「${displayFile.name}」解析完成`, { duration: 2800 })
    },
    [onTaskUpdate],
  )

  const uploadNormalAsync = useCallback(
    async (task: UploadTask): Promise<void> => {
      const controller = new AbortController()
      controllersRef.current.set(task.id, controller)
      onTaskUpdate(task.id, { status: 'uploading', abortFn: () => controller.abort() })

      try {
        const result = await filesApi.upload(
          task.file,
          (percent) => onTaskUpdate(task.id, { progress: Math.min(percent, 99) }),
          controller.signal,
        )
        controllersRef.current.delete(task.id)
        onTaskUpdate(task.id, { serverFileId: result.id, progress: 99, status: 'parsing' })
        const parsed = await pollUntilParsed(result.id)
        applyParsed(task.id, parsed, task.file)
      } catch (err: unknown) {
        controllersRef.current.delete(task.id)
        if ((err as { name?: string }).name === 'CanceledError' || (err as { name?: string }).name === 'AbortError') {
          return
        }
        const msg = (err as Error).message || '上传或解析失败'
        onTaskUpdate(task.id, {
          status: 'error',
          errorMessage: msg,
          pollingTimer: undefined,
        })
        toast.error(`${msg}\n${parseErrorHint(msg)}`, { duration: 6500 })
      }
    },
    [onTaskUpdate, applyParsed],
  )

  const uploadChunkedAsync = useCallback(
    async (task: UploadTask): Promise<void> => {
      const { file } = task
      const chunkTotal = Math.ceil(file.size / CHUNK_SIZE)
      const fileId = task.id

      const controller = new AbortController()
      controllersRef.current.set(task.id, controller)
      onTaskUpdate(task.id, { status: 'uploading', abortFn: () => controller.abort() })

      try {
        for (let i = 0; i < chunkTotal; i++) {
          if (controller.signal.aborted) return
          const start = i * CHUNK_SIZE
          const end = Math.min(start + CHUNK_SIZE, file.size)
          const chunk = file.slice(start, end)
          await filesApi.uploadChunk(
            chunk,
            { fileId, chunkIndex: i, chunkTotal, chunkSize: CHUNK_SIZE, start, end },
            (percent) => {
              const overall = Math.round(((i + percent / 100) / chunkTotal) * 95)
              onTaskUpdate(task.id, { progress: overall })
            },
            controller.signal,
          )
        }
        const merged = await filesApi.mergeChunks(fileId, file.name, file.type)
        controllersRef.current.delete(task.id)
        onTaskUpdate(task.id, { serverFileId: merged.id, progress: 99, status: 'parsing' })
        const parsed = await pollUntilParsed(merged.id)
        applyParsed(task.id, parsed, task.file)
      } catch (err: unknown) {
        controllersRef.current.delete(task.id)
        if ((err as { name?: string }).name === 'CanceledError' || (err as { name?: string }).name === 'AbortError') {
          return
        }
        const msg = (err as Error).message || '分片上传失败'
        onTaskUpdate(task.id, {
          status: 'error',
          errorMessage: msg,
          pollingTimer: undefined,
        })
        toast.error(`${msg}\n${parseErrorHint(msg)}`, { duration: 6500 })
      }
    },
    [onTaskUpdate, applyParsed],
  )

  const prepareFile = useCallback(async (file: File): Promise<File> => {
    if (!file.type.startsWith('image/')) return file
    try {
      return await compressImageIfNeeded(file)
    } catch {
      return file
    }
  }, [])

  const runPipelineForTask = useCallback(
    async (task: UploadTask) => {
      const compressed = await prepareFile(task.file)
      if (compressed !== task.file) {
        onTaskUpdate(task.id, { file: compressed })
      }
      const t = compressed !== task.file ? { ...task, file: compressed } : task
      if (t.file.size > CHUNK_THRESHOLD) {
        await uploadChunkedAsync(t)
      } else {
        await uploadNormalAsync(t)
      }
    },
    [prepareFile, onTaskUpdate, uploadChunkedAsync, uploadNormalAsync],
  )

  const pauseUpload = useCallback(
    (taskId: string) => {
      const ctrl = controllersRef.current.get(taskId)
      if (ctrl) {
        ctrl.abort()
        controllersRef.current.delete(taskId)
      }
      onTaskUpdate(taskId, { status: 'paused' })
    },
    [onTaskUpdate],
  )

  const resumeUpload = useCallback(
    (task: UploadTask) => {
      pipelineTailRef.current = pipelineTailRef.current
        .then(() => runPipelineForTask(task))
        .catch(() => {})
    },
    [runPipelineForTask],
  )

  const cancelUpload = useCallback(
    (task: UploadTask) => {
      const ctrl = controllersRef.current.get(task.id)
      if (ctrl) {
        ctrl.abort()
        controllersRef.current.delete(task.id)
      }
      if (task.pollingTimer) clearInterval(task.pollingTimer)
      if (task.serverFileId) {
        filesApi.deleteFile(task.serverFileId).catch(() => {})
      }
      onTaskRemove(task.id)
    },
    [onTaskRemove],
  )

  const retryUpload = useCallback(
    (task: UploadTask) => {
      if (task.serverFileId && task.status === 'error') {
        onTaskUpdate(task.id, { status: 'parsing', errorMessage: undefined, progress: 99 })
        pipelineTailRef.current = pipelineTailRef.current
          .then(async () => {
            await filesApi.retryParse(task.serverFileId!)
            const parsed = await pollUntilParsed(task.serverFileId!)
            applyParsed(task.id, parsed, task.file)
          })
          .catch((e) => {
            const msg = (e as Error).message || '重试失败'
            onTaskUpdate(task.id, {
              status: 'error',
              errorMessage: msg,
            })
            toast.error(`${msg}\n${parseErrorHint(msg)}`, { duration: 6500 })
          })
      } else {
        onTaskUpdate(task.id, {
          status: 'idle',
          progress: 0,
          errorMessage: undefined,
        })
        pipelineTailRef.current = pipelineTailRef.current
          .then(() => runPipelineForTask(task))
          .catch(() => {})
      }
    },
    [onTaskUpdate, runPipelineForTask, applyParsed],
  )

  const addFiles = useCallback(
    (files: File[]): Array<{ file: File; reason: string }> => {
      const rejected: Array<{ file: File; reason: string }> = []

      for (const file of files) {
        const err = validateFile(file)
        if (err) {
          rejected.push({ file, reason: err })
          continue
        }
        const task = initTask(file)
        pipelineTailRef.current = pipelineTailRef.current
          .then(() => runPipelineForTask(task))
          .catch(() => {})
      }

      return rejected
    },
    [validateFile, initTask, runPipelineForTask],
  )

  return {
    addFiles,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    retryUpload,
    validateFile,
  }
}

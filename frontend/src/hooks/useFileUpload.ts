/**
 * useFileUpload
 *
 * 封装多文件批量上传的核心逻辑：
 * - 文件校验（格式、大小）
 * - 普通上传 / 大文件分片上传
 * - 暂停 / 继续 / 取消 / 删除
 * - 上传完成后自动轮询解析状态，触发 useFileParser
 */

import { useCallback, useRef } from 'react'
import { filesApi, CHUNK_THRESHOLD, CHUNK_SIZE } from '@/api/files'
import { detectSensitive, maskText } from '@/utils/sensitiveDetector'
import { extractRequirements } from '@/utils/requirementExtractor'
import type { UploadTask, SupportedExtension } from '@/types/upload'

/** 支持的扩展名集合 */
const SUPPORTED_EXTS = new Set<string>([
  'doc', 'docx', 'pdf', 'txt', 'md', 'xlsx', 'json', 'yaml', 'yml', 'png', 'jpg', 'jpeg',
])

/** 单文件最大大小：100 MB */
const MAX_FILE_SIZE = 100 * 1024 * 1024

/** 轮询解析状态的间隔 ms */
const POLL_INTERVAL = 2000
/** 轮询最大次数（超时后置 error） */
const POLL_MAX_TIMES = 30

type UpdateTaskFn = (id: string, patch: Partial<UploadTask>) => void

interface UseFileUploadOptions {
  /** 当某个 task 状态发生变化时调用（用于 setState） */
  onTaskUpdate: UpdateTaskFn
  /** 新增 task（文件刚选中/拖入时） */
  onTaskAdd: (task: UploadTask) => void
  /** 删除 task */
  onTaskRemove: (id: string) => void
}

export function useFileUpload({ onTaskUpdate, onTaskAdd, onTaskRemove }: UseFileUploadOptions) {
  /**
   * 存储每个 task 的 AbortController，用于取消/暂停请求
   * key: taskId
   */
  const controllersRef = useRef<Map<string, AbortController>>(new Map())

  /** 校验文件并返回错误消息，合法返回 null */
  const validateFile = useCallback((file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!SUPPORTED_EXTS.has(ext as SupportedExtension)) {
      return `不支持的文件格式 .${ext}，请上传 DOC/DOCX/PDF/TXT/MD/XLSX/JSON/YAML/PNG/JPG`
    }
    if (file.size > MAX_FILE_SIZE) {
      return `文件过大（${(file.size / 1024 / 1024).toFixed(1)} MB），单文件不超过 100 MB`
    }
    return null
  }, [])

  /** 初始化并添加一个 UploadTask（还未开始上传） */
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

  /**
   * 轮询服务端解析状态
   * 解析完成后提取需求点 + 敏感信息
   */
  const startPolling = useCallback(
    (taskId: string, serverFileId: string) => {
      let times = 0

      const timer = setInterval(async () => {
        times++
        try {
          const file = await filesApi.getFileById(serverFileId)

          if (file.status === 'PARSED' && file.parsedContent) {
            clearInterval(timer)
            const text = file.parsedContent
            const sensitiveMatches = detectSensitive(text)
            const maskedText = maskText(text, sensitiveMatches)
            const requirementPoints = extractRequirements(maskedText, file.originalName)

            onTaskUpdate(taskId, {
              status: 'parsed',
              parsedText: text,
              maskedText,
              sensitiveMatches,
              requirementPoints,
              progress: 100,
              pollingTimer: undefined,
            })
          } else if (file.status === 'FAILED') {
            clearInterval(timer)
            onTaskUpdate(taskId, {
              status: 'error',
              errorMessage: '服务端解析失败，请重试',
              pollingTimer: undefined,
            })
          } else if (times >= POLL_MAX_TIMES) {
            clearInterval(timer)
            onTaskUpdate(taskId, {
              status: 'error',
              errorMessage: '解析超时，请稍后重试',
              pollingTimer: undefined,
            })
          }
        } catch {
          if (times >= POLL_MAX_TIMES) {
            clearInterval(timer)
            onTaskUpdate(taskId, {
              status: 'error',
              errorMessage: '解析状态查询失败',
              pollingTimer: undefined,
            })
          }
        }
      }, POLL_INTERVAL)

      // 将 timer id 写入 task，以便外部取消
      onTaskUpdate(taskId, { pollingTimer: timer, status: 'parsing' })
    },
    [onTaskUpdate],
  )

  /**
   * 执行普通上传（单文件 ≤ CHUNK_THRESHOLD）
   */
  const uploadNormal = useCallback(
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
        onTaskUpdate(task.id, { serverFileId: result.id, progress: 99 })
        startPolling(task.id, result.id)
      } catch (err: unknown) {
        controllersRef.current.delete(task.id)
        if ((err as { name?: string }).name === 'CanceledError' ||
            (err as { name?: string }).name === 'AbortError') {
          // 用户主动取消，保持 paused 状态（外部已设置）
          return
        }
        onTaskUpdate(task.id, {
          status: 'error',
          errorMessage: (err as Error).message || '上传失败，请重试',
        })
      }
    },
    [onTaskUpdate, startPolling],
  )

  /**
   * 执行分片上传（大文件 > CHUNK_THRESHOLD）
   */
  const uploadChunked = useCallback(
    async (task: UploadTask): Promise<void> => {
      const { file } = task
      const chunkTotal = Math.ceil(file.size / CHUNK_SIZE)
      const fileId = task.id // 复用 task id 作为前端临时文件 id

      const controller = new AbortController()
      controllersRef.current.set(task.id, controller)
      onTaskUpdate(task.id, { status: 'uploading', abortFn: () => controller.abort() })

      try {
        for (let i = 0; i < chunkTotal; i++) {
          // 检查是否被暂停/取消
          if (controller.signal.aborted) return

          const start = i * CHUNK_SIZE
          const end = Math.min(start + CHUNK_SIZE, file.size)
          const chunk = file.slice(start, end)

          await filesApi.uploadChunk(
            chunk,
            { fileId, chunkIndex: i, chunkTotal, chunkSize: CHUNK_SIZE, start, end },
            (percent) => {
              // 当前分片进度 → 整体进度
              const overall = Math.round(((i + percent / 100) / chunkTotal) * 95)
              onTaskUpdate(task.id, { progress: overall })
            },
            controller.signal,
          ).then((r) => {
            if (!r || r.uploaded !== true) {
              throw new Error(`分片上传失败：chunkIndex=${i}`)
            }
            return r
          })
        }

        // 所有分片上传完毕，通知服务端合并
        const merged = await filesApi.mergeChunks(fileId, file.name, file.type, chunkTotal)
        controllersRef.current.delete(task.id)
        onTaskUpdate(task.id, { serverFileId: merged.id, progress: 99 })
        startPolling(task.id, merged.id)
      } catch (err: unknown) {
        controllersRef.current.delete(task.id)
        if ((err as { name?: string }).name === 'CanceledError' ||
            (err as { name?: string }).name === 'AbortError') {
          return
        }
        onTaskUpdate(task.id, {
          status: 'error',
          errorMessage: (err as Error).message || '分片上传失败，请重试',
        })
      }
    },
    [onTaskUpdate, startPolling],
  )

  /** 开始上传（自动选择普通/分片模式） */
  const startUpload = useCallback(
    (task: UploadTask) => {
      if (task.file.size > CHUNK_THRESHOLD) {
        uploadChunked(task)
      } else {
        uploadNormal(task)
      }
    },
    [uploadNormal, uploadChunked],
  )

  /** 暂停上传（中断当前请求，进度保留） */
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

  /** 继续上传（从头重传，分片断点续传依赖服务端实现） */
  const resumeUpload = useCallback(
    (task: UploadTask) => {
      startUpload(task)
    },
    [startUpload],
  )

  /** 取消并删除 task */
  const cancelUpload = useCallback(
    (task: UploadTask) => {
      // 中断进行中的请求
      const ctrl = controllersRef.current.get(task.id)
      if (ctrl) {
        ctrl.abort()
        controllersRef.current.delete(task.id)
      }
      // 清除解析轮询
      if (task.pollingTimer) clearInterval(task.pollingTimer)
      // 若已上传到服务端，删除远程文件
      if (task.serverFileId) {
        filesApi.deleteFile(task.serverFileId).catch(() => {})
      }
      onTaskRemove(task.id)
    },
    [onTaskRemove],
  )

  /** 重试（仅限 error 状态） */
  const retryUpload = useCallback(
    (task: UploadTask) => {
      // 如果已经上传但解析失败，直接重试解析
      if (task.serverFileId && task.status === 'error') {
        onTaskUpdate(task.id, { status: 'parsing', errorMessage: undefined })
        filesApi
          .retryParse(task.serverFileId)
          .then(() => startPolling(task.id, task.serverFileId!))
          .catch((e) =>
            onTaskUpdate(task.id, { status: 'error', errorMessage: e.message }),
          )
      } else {
        // 上传就失败了，重新上传
        onTaskUpdate(task.id, {
          status: 'idle',
          progress: 0,
          errorMessage: undefined,
        })
        startUpload(task)
      }
    },
    [onTaskUpdate, startPolling, startUpload],
  )

  /**
   * 批量添加文件并立即开始上传
   * @returns 被过滤掉的无效文件列表（及原因）
   */
  const addFiles = useCallback(
    (files: File[]): Array<{ file: File; reason: string }> => {
      const rejected: Array<{ file: File; reason: string }> = []

      files.forEach((file) => {
        const err = validateFile(file)
        if (err) {
          rejected.push({ file, reason: err })
          return
        }
        const task = initTask(file)
        // 微任务中启动上传，避免 React state 批次问题
        setTimeout(() => startUpload(task), 0)
      })

      return rejected
    },
    [validateFile, initTask, startUpload],
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

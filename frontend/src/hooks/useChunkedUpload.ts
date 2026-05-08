/**
 * useChunkedUpload —— AI 分析页专用的单文件上传 Hook
 * - 小文件走单次上传，大文件自动分片
 * - 3 次指数退避重试
 * - 支持 AbortController 取消
 * - 上传进度回调（百分比 + 已传输字节）
 */

import { useState, useCallback, useRef } from 'react'
import { filesApi, CHUNK_THRESHOLD, CHUNK_SIZE } from '@/api/files'
import type { UploadedFile } from '@/types'
import { safeRandomUUID } from '@/utils/uuid'
import { preprocessPdfForUpload } from '@/utils/pdfPreprocess'

export type UploadStatus = 'idle' | 'uploading' | 'merging' | 'done' | 'error' | 'cancelled'

export interface UploadProgress {
  status: UploadStatus
  percent: number
  loaded: number
  total: number
  /** 当前分片 / 总分片（大文件时有意义） */
  chunkCurrent?: number
  chunkTotal?: number
  error?: string
}

const MAX_RETRY = 3
const SUPPORTED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xlsx', 'xls', 'txt', 'md', 'yaml', 'yml', 'png', 'jpg', 'jpeg',
])
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function useChunkedUpload() {
  const [progress, setProgress] = useState<UploadProgress>({
    status: 'idle',
    percent: 0,
    loaded: 0,
    total: 0,
  })
  const abortRef = useRef<AbortController | null>(null)

  /** 校验文件类型和大小 */
  const validateFile = useCallback((file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      return `不支持的文件格式 .${ext}，请上传 PDF/DOCX/XLSX/TXT/MD/YAML/PNG/JPG`
    }
    if (file.size > MAX_FILE_SIZE) {
      return `文件过大（${(file.size / 1024 / 1024).toFixed(1)} MB），单文件不超过 100 MB`
    }
    return null
  }, [])

  /** 单次上传小文件 */
  const uploadSmall = useCallback(async (file: File, signal: AbortSignal): Promise<UploadedFile> => {
    return filesApi.upload(file, (percent) => {
      setProgress((p) => ({
        ...p,
        status: 'uploading',
        percent: Math.min(percent, 99),
        loaded: Math.round((percent / 100) * file.size),
        total: file.size,
      }))
    }, signal)
  }, [])

  /** 分片上传大文件 */
  const uploadLarge = useCallback(async (file: File, signal: AbortSignal): Promise<UploadedFile> => {
    const chunkTotal = Math.ceil(file.size / CHUNK_SIZE)
    const fileId = safeRandomUUID()
    let uploadedBytes = 0

    for (let i = 0; i < chunkTotal; i++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, file.size)
      const chunk = file.slice(start, end)

      let retries = 0
      while (retries < MAX_RETRY) {
        try {
          await filesApi.uploadChunk(
            chunk,
            { fileId, chunkIndex: i, chunkTotal, chunkSize: CHUNK_SIZE, start, end },
            (chunkPercent) => {
              const chunkLoaded = Math.round((chunkPercent / 100) * (end - start))
              const totalLoaded = uploadedBytes + chunkLoaded
              const overall = Math.round((totalLoaded / file.size) * 100)
              setProgress({
                status: 'uploading',
                percent: Math.min(overall, 99),
                loaded: totalLoaded,
                total: file.size,
                chunkCurrent: i + 1,
                chunkTotal,
              })
            },
            signal,
          )
          break
        } catch (err) {
          if ((err as Error).name === 'AbortError') throw err
          retries++
          if (retries >= MAX_RETRY) throw err
          await sleep(1000 * Math.pow(2, retries))
        }
      }

      uploadedBytes += (end - start)
    }

    // 合并分片
    setProgress((p) => ({ ...p, status: 'merging', percent: 99 }))
    return filesApi.mergeChunks(fileId, file.name, file.type, chunkTotal)
  }, [])

  /** 主上传方法 */
  const uploadFile = useCallback(async (file: File): Promise<UploadedFile> => {
    const error = validateFile(file)
    if (error) {
      setProgress({ status: 'error', percent: 0, loaded: 0, total: file.size, error })
      throw new Error(error)
    }

    let fileToUpload = file
    if (file.name.toLowerCase().endsWith('.pdf')) {
      try {
        fileToUpload = await preprocessPdfForUpload(file)
      } catch (e) {
        const msg = (e as Error).message || 'PDF 预处理失败'
        setProgress({ status: 'error', percent: 0, loaded: 0, total: file.size, error: msg })
        throw new Error(msg)
      }
    }

    const controller = new AbortController()
    abortRef.current = controller

    setProgress({ status: 'uploading', percent: 0, loaded: 0, total: fileToUpload.size })

    let retries = 0
    while (retries < MAX_RETRY) {
      try {
        const result = fileToUpload.size > CHUNK_THRESHOLD
          ? await uploadLarge(fileToUpload, controller.signal)
          : await uploadSmall(fileToUpload, controller.signal)

        setProgress({ status: 'done', percent: 100, loaded: fileToUpload.size, total: fileToUpload.size })
        abortRef.current = null
        return result
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setProgress((p) => ({ ...p, status: 'cancelled' }))
          abortRef.current = null
          throw err
        }
        retries++
        if (retries >= MAX_RETRY) {
          const msg = (err as Error).message || '上传失败'
          setProgress({ status: 'error', percent: 0, loaded: 0, total: fileToUpload.size, error: msg })
          abortRef.current = null
          throw err
        }
        await sleep(1000 * Math.pow(2, retries))
      }
    }

    throw new Error('上传失败')
  }, [validateFile, uploadSmall, uploadLarge])

  /** 中止上传 */
  const abort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  /** 重置状态 */
  const reset = useCallback(() => {
    abort()
    setProgress({ status: 'idle', percent: 0, loaded: 0, total: 0 })
  }, [abort])

  return { uploadFile, progress, abort, reset, validateFile }
}

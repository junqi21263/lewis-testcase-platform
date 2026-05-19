import type { AxiosRequestConfig } from 'axios'
import { apiClient, request } from '@/utils/request'
import type { UploadedFile, PaginatedData, PaginationParams, ApiResponse } from '@/types'
import type { ChunkInfo } from '@/types/upload'

/** 超过此大小走 `upload/chunk` + `upload/merge`（须与后端一致） */
export const CHUNK_THRESHOLD = 5 * 1024 * 1024
/** 每片大小（须 ≤ 后端单分片校验上限） */
export const CHUNK_SIZE = 2 * 1024 * 1024

/** 解析轮询 / 合并 / 重试解析：响应可能较大或链路较慢，长于全局 60s */
const FILES_LONG_TIMEOUT_MS = 300_000

function unwrapUploadResponse<T>(res: { data: ApiResponse<T> }): T {
  const body = res.data
  if ((body.code !== 0 && body.code !== 200) || body.data == null) {
    const msg =
      typeof body.message === 'string' && body.message.trim() ? body.message : '上传失败'
    throw new Error(msg)
  }
  return body.data
}

function multipartConfig(
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): AxiosRequestConfig {
  return {
    signal,
    headers: { 'Content-Type': undefined },
    onUploadProgress(e) {
      if (e.total) onProgress?.(Math.round((e.loaded * 100) / e.total))
    },
  }
}

export const filesApi = {
  /** 单请求上传（不超过 `MAX_FILE_SIZE` 时可直接使用） */
  upload(
    file: File,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<UploadedFile> {
    const formData = new FormData()
    formData.append('file', file)

    return apiClient
      .post<ApiResponse<UploadedFile>>('/files/upload', formData, multipartConfig(onProgress, signal))
      .then(unwrapUploadResponse)
  },

  /**
   * 分片上传单个分片
   * @param chunk - 该分片的 Blob
   * @param info  - 分片元信息
   * @param signal - 取消信号
   */
  uploadChunk(
    chunk: Blob,
    info: ChunkInfo,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<{ uploaded: boolean }> {
    const formData = new FormData()
    formData.append('chunk', chunk)
    formData.append('fileId', info.fileId)
    formData.append('chunkIndex', String(info.chunkIndex))
    formData.append('chunkTotal', String(info.chunkTotal))
    formData.append('chunkSize', String(info.chunkSize))

    return apiClient
      .post<ApiResponse<{ uploaded: boolean }>>(
        '/files/upload/chunk',
        formData,
        multipartConfig(onProgress, signal),
      )
      .then(unwrapUploadResponse)
  },

  /**
   * 合并分片，触发服务端合并 + 解析
   */
  mergeChunks(
    fileId: string,
    originalName: string,
    mimeType: string,
    chunkTotal: number,
  ): Promise<UploadedFile> {
    return request.post<UploadedFile>(
      '/files/upload/merge',
      {
        fileId,
        originalName,
        mimeType,
        chunkTotal,
      },
      { timeout: FILES_LONG_TIMEOUT_MS },
    )
  },

  /** 轮询文件解析状态，直到 status 为 PARSED 或 FAILED */
  getFileById: (id: string) =>
    request.get<UploadedFile>(`/files/${id}`, {
      timeout: FILES_LONG_TIMEOUT_MS,
      suppressToast: true,
    }),

  /** 重新触发文件解析（可选仅内置文本层） */
  retryParse: (id: string, opts?: { textOnly?: boolean }) =>
    request.post<UploadedFile>(
      `/files/${id}/parse`,
      opts?.textOnly ? { textOnly: true } : {},
      { timeout: FILES_LONG_TIMEOUT_MS },
    ),

  /** 根据用户编辑后的全文重新结构化（脱敏 + LLM） */
  restructure: (id: string, text: string) =>
    request.post<UploadedFile>(`/files/${id}/restructure`, { text }),

  getFileList: (params?: PaginationParams) =>
    request.get<PaginatedData<UploadedFile>>('/files', { params }),

  deleteFile: (id: string) => request.delete<void>(`/files/${id}`),

  /** 取消正在解析的任务 */
  cancelTask: (id: string) => request.post<UploadedFile>(`/files/${id}/cancel`),
}

import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { ConfigService } from '@nestjs/config'
import { ImageOcrPipelineService } from './image-ocr-pipeline.service'

export type OcrTaskStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED'

export interface OcrTaskState {
  id: string
  userId: string
  status: OcrTaskStatus
  /** 0–100 */
  progress: number
  result?: string
  error?: string
  tempPath?: string
  createdAt: number
  updatedAt: number
}

/**
 * 独立 OCR 异步任务（内存态）：POST /ocr/upload 立即返回 taskId，后台跑 pipeline。
 * 与「文件表 + PENDING 解析 worker」并存，便于前端做「先拿任务再轮询/SSE」的体验演示。
 */
@Injectable()
export class OcrTaskService {
  private readonly logger = new Logger(OcrTaskService.name)
  private readonly tasks = new Map<string, OcrTaskState>()

  constructor(
    private readonly config: ConfigService,
    private readonly pipeline: ImageOcrPipelineService,
  ) {}

  /** 落盘临时文件并排队执行 OCR */
  async createFromUpload(file: Express.Multer.File, userId: string): Promise<{ taskId: string }> {
    const id = randomUUID()
    const dir = this.config.get<string>('UPLOAD_DIR', './uploads')
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin'
    const safeExt = ext.match(/^\.[a-z0-9]+$/) ? ext : '.bin'
    const tempPath = path.join(dir, `ocr-task-${id}${safeExt}`)
    fs.writeFileSync(tempPath, file.buffer)

    const row: OcrTaskState = {
      id,
      userId,
      status: 'PENDING',
      progress: 0,
      tempPath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.tasks.set(id, row)

    setImmediate(() => void this.runTask(id))

    return { taskId: id }
  }

  get(taskId: string, userId: string): OcrTaskState | null {
    const t = this.tasks.get(taskId)
    if (!t || t.userId !== userId) return null
    return { ...t, tempPath: undefined }
  }

  private async runTask(id: string) {
    const t = this.tasks.get(id)
    if (!t?.tempPath) return
    this.patch(id, { status: 'PROCESSING', progress: 5 })
    try {
      const text = await this.pipeline.recognizeFilePath(t.tempPath, {
        onProgress: async (p) => {
          const total = p.ocrStripTotal ?? 1
          const cur = p.ocrStripCurrent ?? 0
          const pct = Math.min(95, 10 + Math.round((cur / Math.max(total, 1)) * 85))
          this.patch(id, { progress: pct })
        },
      })
      this.patch(id, { status: 'SUCCESS', progress: 100, result: text })
    } catch (e) {
      const msg = (e as Error).message?.slice(0, 2000) ?? 'OCR 失败'
      this.patch(id, { status: 'FAILED', progress: 100, error: msg })
      this.logger.warn(`OCR 任务失败 ${id}: ${msg}`)
    } finally {
      const row = this.tasks.get(id)
      if (row?.tempPath && fs.existsSync(row.tempPath)) {
        try {
          fs.unlinkSync(row.tempPath)
        } catch {
          /* ignore */
        }
      }
      this.patch(id, { tempPath: undefined })
    }
  }

  private patch(id: string, partial: Partial<OcrTaskState>) {
    const cur = this.tasks.get(id)
    if (!cur) return
    this.tasks.set(id, { ...cur, ...partial, updatedAt: Date.now() })
  }
}

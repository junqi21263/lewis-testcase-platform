import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import * as path from 'path'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { FileStatus, FileType, Prisma } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { PrismaService } from '@/prisma/prisma.service'
import { DocumentVisionService } from './document-vision.service'
import { RequirementStructureService } from './requirement-structure.service'
import { maskSensitivePlainText } from '@/common/utils/sensitive-mask'
import { v4 as uuid } from 'uuid'
import axios from 'axios'
import type { MergeChunksDto } from './dto/merge-chunks.dto'
import { CosStorageService, formatCosClientError } from './cos-storage.service'
import { ImageOcrPipelineService } from '@/modules/ocr/image-ocr-pipeline.service'
import { ImagePreprocessService } from '@/modules/ocr/image-preprocess.service'
import { TencentOcrClientService } from '@/modules/ocr/tencent-ocr.client.service'
import { PdfDocumentParseService } from './pdf-document-parse.service'
import { PdfFlowchartParseService } from './pdf-flowchart-parse.service'
import { decidePdfParseStrategy } from './pdf-fast-parse-strategy.util'
import { MultimodalService } from '@/modules/multimodal/multimodal.service'
import { FileParseRuntimeService } from './file-parse-runtime.service'
import { sanitizeErrorMessageForClient } from '@/utils/sanitizeErrorMessage'
import { assertUploadMagicNumber } from './file-upload-validation.util'
import {
  buildPdfPagedVisionExtractionPrompt,
  isGenericHunyuanPlaceholderOutput,
  isHunyuanMultimodalEnabled,
  isPdfTooLargeForHunyuanWholeFileBase64,
  resolveHunyuanVisionApiKey,
  runHunyuanOpenAiVisionChatFromImages,
} from '@/utils/multimodalAnalysis'

@Injectable()
export class FilesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FilesService.name)
  private readonly uploadDir: string
  private parseWorkerTimer?: NodeJS.Timeout
  private parseWorkerEnabled = true
  /** 当前正在执行的 parseFileAsync 数量（与 FILE_PARSE_WORKER_MAX_CONCURRENT 配合） */
  private activeParseWorkerJobs = 0
  /** 解析 worker 最大并发（默认 3，上限 16）；多图上传时可并行混元/OCR */
  private parseWorkerMaxConcurrent = 3
  /** 串行化「补位认领」，避免并发 tick 超发 */
  private parseWorkerChain: Promise<void> = Promise.resolve()

  private isNotFoundUpdateError(err: unknown) {
    return err instanceof PrismaClientKnownRequestError && err.code === 'P2025'
  }

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private documentVision: DocumentVisionService,
    private requirementStructure: RequirementStructureService,
    private cosStorage: CosStorageService,
    private readonly imageOcrPipeline: ImageOcrPipelineService,
    private readonly imagePreprocess: ImagePreprocessService,
    private readonly tencentOcr: TencentOcrClientService,
    private readonly pdfDocumentParse: PdfDocumentParseService,
    private readonly multimodal: MultimodalService,
    private readonly pdfFlowchartParse: PdfFlowchartParseService,
    private readonly fileParseRuntime: FileParseRuntimeService = new FileParseRuntimeService(),
  ) {
    this.uploadDir = this.config.get<string>('UPLOAD_DIR', './uploads')
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true })
    }
    this.logger.log('FilesService initialized')
  }

  onModuleInit() {
    // 后台解析 worker：扫描 PENDING 文件并解析（避免进程重启导致 parseFileAsync 丢失）
    this.parseWorkerEnabled = this.config.get<string>('FILE_PARSE_WORKER_ENABLED') !== '0'
    if (!this.parseWorkerEnabled) {
      this.logger.warn('FILE_PARSE_WORKER_ENABLED=0，后台解析 worker 已关闭')
      return
    }
    const maxRaw = parseInt(this.config.get<string>('FILE_PARSE_WORKER_MAX_CONCURRENT') || '3', 10)
    if (Number.isFinite(maxRaw) && maxRaw >= 1) {
      this.parseWorkerMaxConcurrent = Math.min(maxRaw, 16)
    }
    const intervalMs = parseInt(this.config.get<string>('FILE_PARSE_WORKER_INTERVAL_MS') || '1500', 10)
    const ms = Number.isFinite(intervalMs) && intervalMs > 300 ? intervalMs : 1500
    this.parseWorkerTimer = setInterval(() => void this.enqueueParseWorkerFill(), ms)
    this.logger.log(
      `后台解析 worker 已启动（interval=${ms}ms，maxConcurrent=${this.parseWorkerMaxConcurrent}）`,
    )
    // 启动后立即补位（避免新上传文件等待 1 个 interval）
    void this.enqueueParseWorkerFill()
  }

  onModuleDestroy() {
    if (this.parseWorkerTimer) clearInterval(this.parseWorkerTimer)
  }

  private parseTimeoutMinutes(): number {
    const timeoutMin = parseInt(this.config.get<string>('FILE_PARSE_TIMEOUT_MINUTES') || '15', 10)
    return Number.isFinite(timeoutMin) && timeoutMin > 0 ? timeoutMin : 15
  }

  /**
   * 仅针对「进程重启/异常退出导致任务丢失」的僵尸 PARSING 自动恢复次数上限。
   * 正常失败会直接落 FAILED，不依赖此兜底。
   */
  private parseRecoverMaxAttempts(): number {
    const raw = parseInt(this.config.get<string>('FILE_PARSE_RECOVER_MAX_ATTEMPTS') || '3', 10)
    return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 10) : 3
  }

  private canRetrySourcePath(storedPath: string | null | undefined): boolean {
    const p = storedPath?.trim()
    if (!p) return false
    return CosStorageService.isCosUri(p) || fs.existsSync(p)
  }

  private staleParsingDate(value: Date | null | undefined, fallback?: Date | null): Date | null {
    if (value instanceof Date) return value
    if (fallback instanceof Date) return fallback
    return null
  }

  /**
   * 服务重启后，先前已 CLAIMED / PARSING 的任务会留在数据库里，worker 不会主动再捞。
   * 这里按超时阈值把僵尸任务重新排队；多次自动恢复后仍丢失的，改标 FAILED，避免永远卡住。
   */
  private async recoverStaleParsingFiles(): Promise<number> {
    const deadline = new Date(Date.now() - this.parseTimeoutMinutes() * 60_000)
    const stale = await this.prisma.uploadedFile.findMany({
      where: {
        status: FileStatus.PARSING,
        OR: [
          { lastHeartbeatAt: { lt: deadline } },
          { lastHeartbeatAt: null, updatedAt: { lt: deadline } },
        ],
        path: { not: null },
      },
      orderBy: [{ lastHeartbeatAt: 'asc' }, { updatedAt: 'asc' }],
      take: Math.max(this.parseWorkerMaxConcurrent * 4, 8),
      select: {
        id: true,
        path: true,
        originalName: true,
        parseAttempts: true,
        lastHeartbeatAt: true,
        updatedAt: true,
      },
    })
    if (!stale.length) return 0

    const now = new Date()
    const maxAttempts = this.parseRecoverMaxAttempts()
    let recovered = 0

    for (const row of stale) {
      const attempts = Math.max(0, Number(row.parseAttempts || 0))
      const canRetry = this.canRetrySourcePath(row.path)
      const lockAt = this.staleParsingDate(row.lastHeartbeatAt, row.updatedAt)
      if (canRetry && attempts < maxAttempts) {
        const updated = await this.prisma.uploadedFile.updateMany({
          where: {
            id: row.id,
            status: FileStatus.PARSING,
            ...(lockAt ? { lastHeartbeatAt: lockAt } : { updatedAt: row.updatedAt }),
          },
          data: {
            status: FileStatus.PENDING,
            parseStage: 'PENDING',
            parseError: null,
            parseStartedAt: null,
            parseFinishedAt: null,
            parseProgress: Prisma.DbNull,
            lastHeartbeatAt: now,
          },
        })
        if (updated.count === 1) {
          recovered++
          this.logger.warn(
            `后台解析 worker: 已回收僵尸任务并重新排队 file=${row.id} attempts=${attempts} name=${row.originalName}`,
          )
        }
        continue
      }

      const reason = canRetry
        ? `【解析失败】解析任务已自动恢复 ${attempts} 次仍未完成，请点击「重试解析」。`
        : '【解析失败】源文件已不存在，无法自动恢复解析，请重新上传。'
      const failed = await this.prisma.uploadedFile.updateMany({
        where: {
          id: row.id,
          status: FileStatus.PARSING,
          ...(lockAt ? { lastHeartbeatAt: lockAt } : { updatedAt: row.updatedAt }),
        },
        data: {
          status: FileStatus.FAILED,
          parseStage: 'FAILED',
          parseError: reason,
          parseFinishedAt: now,
          parseProgress: Prisma.DbNull,
          lastHeartbeatAt: now,
        },
      })
      if (failed.count === 1) {
        this.logger.warn(
          `后台解析 worker: 僵尸任务恢复失败，已标记 FAILED file=${row.id} attempts=${attempts} retryable=${canRetry}`,
        )
      }
    }

    return recovered
  }

  /** 将一次「按并发上限补认领」排入队列，避免多 tick / 多任务结束同时补位造成竞态 */
  private enqueueParseWorkerFill(): void {
    this.parseWorkerChain = this.parseWorkerChain.then(async () => {
      try {
        await this.drainParseWorkerSlots()
      } catch (e) {
        this.logger.error('后台解析 worker 补位失败', e as Error)
      }
    })
  }

  /** 在不超过并发上限时连续认领并启动解析，直到无 PENDING 或槽位已满 */
  private async drainParseWorkerSlots(): Promise<void> {
    await this.recoverStaleParsingFiles()
    this.logger.debug(
      `后台解析 worker: 补位中 active=${this.activeParseWorkerJobs}/${this.parseWorkerMaxConcurrent}`,
    )
    while (this.activeParseWorkerJobs < this.parseWorkerMaxConcurrent) {
      const claimed = await this.claimNextPendingFile()
      if (!claimed) {
        this.logger.debug('后台解析 worker: 无待处理 PENDING 文件')
        return
      }
      this.activeParseWorkerJobs++
      void this.runParseWorkerJob(claimed)
    }
  }

  private async runParseWorkerJob(claimed: {
    id: string
    path: string
    fileType: FileType
    mimeType: string
  }): Promise<void> {
    try {
      this.logger.log(`后台解析 worker: 已认领文件 ${claimed.id} (${claimed.fileType})`)
      await this.parseFileAsync(claimed.id, claimed.path, claimed.fileType, claimed.mimeType)
    } catch (e) {
      this.logger.error(`后台解析 worker 文件 ${claimed.id} 异常`, e as Error)
    } finally {
      this.activeParseWorkerJobs = Math.max(0, this.activeParseWorkerJobs - 1)
      this.enqueueParseWorkerFill()
    }
  }

  /**
   * 上传成功后尽快尝试启动解析，减少用户体感等待（尤其是批量图片最后一张排队慢）。
   * 仍受 parseWorkerMaxConcurrent 限制，超限时回退给后台 worker 补位。
   */
  private async tryStartParseImmediately(claimed: {
    id: string
    path: string
    fileType: FileType
    mimeType: string
  }): Promise<void> {
    await this.fileParseRuntime.enqueue(claimed.id, claimed.fileType)
    if (!claimed.path?.trim()) return
    if (!this.parseWorkerEnabled) return
    if (this.activeParseWorkerJobs >= this.parseWorkerMaxConcurrent) {
      this.enqueueParseWorkerFill()
      return
    }
    const now = new Date()
    const updated = await this.prisma.uploadedFile.updateMany({
      where: { id: claimed.id, status: FileStatus.PENDING },
      data: {
        status: FileStatus.PARSING,
        parseStage: 'CLAIMED',
        parseStartedAt: now,
        lastHeartbeatAt: now,
        parseAttempts: { increment: 1 },
        parseError: null,
      },
    })
    if (updated.count !== 1) return

    this.activeParseWorkerJobs++
    this.logger.debug(`上传后即时启动解析: ${claimed.id} (${claimed.fileType})`)
    void this.runParseWorkerJob(claimed)
  }

  private async claimNextPendingFile(): Promise<{
    id: string
    path: string
    fileType: FileType
    mimeType: string
  } | null> {
    // 只认领 PENDING；避免并发争抢，用 updateMany 做原子认领
    const next = await this.prisma.uploadedFile.findFirst({
      where: { status: FileStatus.PENDING, path: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, path: true, fileType: true, mimeType: true },
    })
    if (!next) return null
    if (!next.path?.trim()) {
      try {
        await this.prisma.uploadedFile.update({
          where: { id: next.id },
          data: {
            status: FileStatus.FAILED,
            parseError: '【解析失败】文件路径无效，请重新上传',
            parseStage: 'FAILED',
            parseFinishedAt: new Date(),
            lastHeartbeatAt: new Date(),
          },
        })
      } catch (e) {
        if (!this.isNotFoundUpdateError(e)) throw e
      }
      return null
    }

    const now = new Date()
    const updated = await this.prisma.uploadedFile.updateMany({
      where: { id: next.id, status: FileStatus.PENDING },
      data: {
        status: FileStatus.PARSING,
        parseStage: 'CLAIMED',
        parseStartedAt: now,
        lastHeartbeatAt: now,
        parseAttempts: { increment: 1 },
        parseError: null,
      },
    })
    if (updated.count !== 1) return null
    return { ...next, path: next.path as string }
  }

  private fileUploadStorageMode(): 'cos' | 'local' {
    const mode = this.config.get<string>('FILE_UPLOAD_STORAGE')?.trim().toLowerCase()
    if (mode === 'local') return 'local'
    if (mode === 'cos') return 'cos'
    return this.cosStorage.isConfigured() ? 'cos' : 'local'
  }

  private shouldUploadToCos(): boolean {
    return this.fileUploadStorageMode() === 'cos'
  }

  /** 保存上传记录并触发异步解析 */
  async saveUploadedFile(file: Express.Multer.File, uploaderId: string) {
    const fileType = this.detectFileType(file.mimetype, file.originalname)
    const safeName =
      (file.filename && String(file.filename).trim()) ||
      `${uuid()}${path.extname(file.originalname) || ''}`

    if (!this.shouldUploadToCos()) {
      return this.saveUploadedFileLocally(file, uploaderId, fileType, safeName)
    }

    if (!this.cosStorage.isConfigured()) {
      throw new BadRequestException(
        'FILE_UPLOAD_STORAGE=cos 但 COS 未配置完整。请设置 COS_SECRET_ID、COS_SECRET_KEY、COS_BUCKET、COS_REGION，或改为 FILE_UPLOAD_STORAGE=local。',
      )
    }

    let uploadBuffer = file.buffer
    if ((!uploadBuffer || uploadBuffer.length === 0) && file.path?.trim()) {
      const localPath = file.path.trim()
      if (!fs.existsSync(localPath)) {
        throw new BadRequestException(`上传文件不存在：${localPath}`)
      }
      uploadBuffer = fs.readFileSync(localPath)
    }
    if (!uploadBuffer || uploadBuffer.length < 1) {
      throw new BadRequestException('上传文件为空（0 bytes），请重试。')
    }
    assertUploadMagicNumber(uploadBuffer, file.originalname, file.mimetype)

    try {
      const uri = await this.cosStorage.uploadBuffer(uploadBuffer, file.originalname)
      const created = await this.prisma.uploadedFile.create({
        data: {
          name: safeName,
          originalName: file.originalname,
          path: uri,
          size: uploadBuffer.length,
          mimeType: file.mimetype,
          fileType,
          status: FileStatus.PENDING,
          parseStage: 'PENDING',
          uploaderId,
        },
      })
      await this.tryStartParseImmediately({
        id: created.id,
        path: uri,
        fileType,
        mimeType: file.mimetype,
      })
      return this.getFileById(created.id, uploaderId)
    } catch (e) {
      this.logger.error(`COS 上传失败: ${(e as Error).message}`, e as Error)
      const hint = formatCosClientError(e)
      throw new BadRequestException(
        `文件上传到 COS 失败：${hint}。可在 VPS 执行 curl /api/health/cos 查看探针；临时可设 FILE_UPLOAD_STORAGE=local。`,
      )
    }
  }

  /** 本地磁盘存储（FILE_UPLOAD_STORAGE=local 或 COS 未配置时） */
  private async saveUploadedFileLocally(
    file: Express.Multer.File,
    uploaderId: string,
    fileType: FileType,
    safeName: string,
  ) {
    let uploadBuffer = file.buffer
    if ((!uploadBuffer || uploadBuffer.length === 0) && file.path?.trim()) {
      const localPath = file.path.trim()
      if (!fs.existsSync(localPath)) {
        throw new BadRequestException(`上传文件不存在：${localPath}`)
      }
      uploadBuffer = fs.readFileSync(localPath)
    }
    if (!uploadBuffer || uploadBuffer.length < 1) {
      throw new BadRequestException('上传文件为空（0 bytes），请重试。')
    }
    assertUploadMagicNumber(uploadBuffer, file.originalname, file.mimetype)

    const storedPath = file.path?.trim()
      ? path.resolve(file.path.trim())
      : path.join(this.uploadDir, safeName)
    if (!file.path?.trim()) {
      fs.writeFileSync(storedPath, uploadBuffer)
    }

    const created = await this.prisma.uploadedFile.create({
      data: {
        name: safeName,
        originalName: file.originalname,
        path: storedPath,
        size: uploadBuffer.length,
        mimeType: file.mimetype,
        fileType,
        status: FileStatus.PENDING,
        parseStage: 'PENDING',
        uploaderId,
      },
    })
    await this.tryStartParseImmediately({
      id: created.id,
      path: storedPath,
      fileType,
      mimeType: file.mimetype,
    })
    return this.getFileById(created.id, uploaderId)
  }

  /** 从本地路径上传（避免先整体读入内存），并创建上传记录 */
  async saveUploadedFileFromPath(
    localPath: string,
    originalName: string,
    mimeType: string,
    uploaderId: string,
  ) {
    if (!fs.existsSync(localPath)) {
      throw new BadRequestException('合并文件不存在，请重试')
    }
    const stat = fs.statSync(localPath)
    if (stat.size < 1) {
      throw new BadRequestException('合并后文件为空')
    }
    const head = Buffer.alloc(Math.min(stat.size, 4096))
    const fd = fs.openSync(localPath, 'r')
    try {
      fs.readSync(fd, head, 0, head.length, 0)
    } finally {
      fs.closeSync(fd)
    }
    assertUploadMagicNumber(head, originalName, mimeType)
    const fileType = this.detectFileType(mimeType, originalName)
    const safeName = `${uuid()}${path.extname(originalName) || ''}`

    if (!this.shouldUploadToCos()) {
      const storedPath = path.resolve(localPath)
      const created = await this.prisma.uploadedFile.create({
        data: {
          name: safeName,
          originalName,
          path: storedPath,
          size: stat.size,
          mimeType,
          fileType,
          status: FileStatus.PENDING,
          parseStage: 'PENDING',
          uploaderId,
        },
      })
      await this.tryStartParseImmediately({
        id: created.id,
        path: storedPath,
        fileType,
        mimeType,
      })
      return this.getFileById(created.id, uploaderId)
    }

    if (!this.cosStorage.isConfigured()) {
      throw new BadRequestException(
        'FILE_UPLOAD_STORAGE=cos 但 COS 未配置完整。请设置 COS 四项或改为 FILE_UPLOAD_STORAGE=local。',
      )
    }

    try {
      const uri = await this.cosStorage.uploadLocalFile(localPath, originalName)
      const created = await this.prisma.uploadedFile.create({
        data: {
          name: safeName,
          originalName,
          path: uri,
          size: stat.size,
          mimeType,
          fileType,
          status: FileStatus.PENDING,
          parseStage: 'PENDING',
          uploaderId,
        },
      })
      await this.tryStartParseImmediately({
        id: created.id,
        path: uri,
        fileType,
        mimeType,
      })
      return this.getFileById(created.id, uploaderId)
    } catch (e) {
      this.logger.error(`COS 上传失败: ${(e as Error).message}`, e as Error)
      throw new BadRequestException(`文件上传到 COS 失败：${formatCosClientError(e)}`)
    }
  }

  /** 异步解析文件内容（图片/PDF 优先多模态视觉理解，再 OCR/文本提取） */
  private async parseFileAsync(
    fileId: string,
    filePath: string,
    fileType: FileType,
    mimeType: string,
  ) {
    const cosPath = CosStorageService.normalizeCosStoredPath(filePath.trim())
    const hintRow = await this.prisma.uploadedFile.findUnique({
      where: { id: fileId },
      select: { parseRetryHint: true, uploaderId: true },
    })
    const parseRetryHint = hintRow?.parseRetryHint ?? null
    const uploaderId = hintRow?.uploaderId ?? null
    const heartbeatState = { lastDbWriteAt: 0, lastDbStage: '' }

    const heartbeat = async (stage: string, progress?: Record<string, unknown>) => {
      try {
        await this.fileParseRuntime.setProgress(fileId, stage, progress ?? null)
        const shouldWriteDb = this.fileParseRuntime.shouldWriteHeartbeatToDb(stage, progress, heartbeatState)
        if (!shouldWriteDb) return
        this.fileParseRuntime.markHeartbeatDbWritten(stage, heartbeatState)
        await this.prisma.uploadedFile.update({
          where: { id: fileId },
          data: {
            lastHeartbeatAt: new Date(),
            parseStage: stage,
            ...(progress && Object.keys(progress).length > 0
              ? { parseProgress: progress as Prisma.InputJsonValue }
              : {}),
          },
        })
      } catch (e) {
        if (this.isNotFoundUpdateError(e)) return
        throw e
      }
    }

    let effectivePath = cosPath
    let cosTempFile: string | null = null

    try {
      let content = ''

      if (CosStorageService.isCosUri(cosPath)) {
        if (!this.cosStorage.isConfigured()) {
          throw new Error('【解析失败】文件在 COS 上，但服务端未配置 COS 密钥')
        }
        await heartbeat('COS_DOWNLOAD', { phase: 'DOWNLOAD', message: 'cos_download_start' })
        try {
          cosTempFile = await this.cosStorage.downloadToTempFile(cosPath)
          effectivePath = cosTempFile
          await heartbeat('COS_DOWNLOAD_OK', { phase: 'DOWNLOAD', message: 'cos_download_done' })
        } catch (e) {
          throw new Error(`【解析失败】从 COS 下载失败：${(e as Error).message}`)
        }
      }

      // 再次确认文件存在且非空（避免零字节文件进入 pdf-to-img 等链路）
      if (!effectivePath || !fs.existsSync(effectivePath)) {
        throw new Error(`【解析失败】本地文件不存在：${effectivePath || '(empty path)'}。请重新上传。`)
      }
      const st = fs.statSync(effectivePath)
      if (st.size < 1) {
        throw new Error(`【解析失败】本地文件为空（0 bytes）：${effectivePath}。请重新上传。`)
      }
      await heartbeat('FILE_OK')

      switch (fileType) {
        case FileType.PDF: {
          const sizeMb = st.size / (1024 * 1024)
          await heartbeat('PDF', {
            phase: 'PDF',
            fileBytes: st.size,
            ...(sizeMb > 5 ? { etaMinutes: Math.max(1, Math.ceil(sizeMb * 0.6)), message: 'large_pdf' } : {}),
          })
          content = await this.parsePdfWithVisionFallback(effectivePath, heartbeat, {
            fileId,
            fileBytes: st.size,
            parseRetryHint,
            originalStoredPath: cosPath,
            uploaderId,
          })
          break
        }
        case FileType.WORD:
          await heartbeat('WORD')
          content = await this.parseWord(effectivePath)
          break
        case FileType.EXCEL:
          await heartbeat('EXCEL')
          content = await this.parseExcel(effectivePath)
          break
        case FileType.YAML:
          await heartbeat('YAML')
          content = fs.readFileSync(effectivePath, 'utf-8')
          break
        case FileType.TEXT:
          await heartbeat('TEXT')
          content = fs.readFileSync(effectivePath, 'utf-8')
          break
        case FileType.IMAGE:
          content = await this.parseImageVisionThenOcr(
            effectivePath,
            mimeType,
            heartbeat,
            cosPath,
            uploaderId,
          )
          break
        default:
          content = '不支持的文件格式'
      }

      content = this.sanitizeParsedText(content)
      const trimmed = content.trim()
      if (!trimmed || trimmed.startsWith('【解析失败】')) {
        throw new Error(trimmed || '内容为空，无法完成解析')
      }

      await heartbeat('STRUCTURE', { phase: 'STRUCTURE' })
      const masked = maskSensitivePlainText(content)
      const { requirements: structured, cleanedText } =
        await this.requirementStructure.structureRequirements(masked)
      const parsedBody =
        cleanedText && cleanedText.trim().length > 0
          ? this.sanitizeParsedText(cleanedText).trim()
          : masked
      const enriched = this.enrichParsedContentWithFlowchart(parsedBody, structured)

      await this.prisma.uploadedFile.update({
        where: { id: fileId },
        data: {
          parsedContent: enriched.parsedContent,
          structuredRequirements: enriched.structuredRequirements as Prisma.InputJsonValue,
          status: FileStatus.PARSED,
          parseError: null,
          parseStage: 'DONE',
          parseFinishedAt: new Date(),
          lastHeartbeatAt: new Date(),
          parseProgress: Prisma.DbNull,
          parseRetryHint: null,
        },
      })
      await this.fileParseRuntime.clearProgress(fileId)
      this.logger.log(`文件解析完成: ${fileId}`)
    } catch (err) {
      const msg = sanitizeErrorMessageForClient(((err as Error).message || '解析失败').slice(0, 8000), 3800)
      try {
        await this.prisma.uploadedFile.update({
          where: { id: fileId },
          data: {
            status: FileStatus.FAILED,
            parseError: msg,
            parseStage: 'FAILED',
            parseFinishedAt: new Date(),
            lastHeartbeatAt: new Date(),
            parseProgress: Prisma.DbNull,
          },
        })
        await this.fileParseRuntime.clearProgress(fileId)
      } catch (e) {
        if (this.isNotFoundUpdateError(e)) {
          this.logger.warn(`文件记录已不存在，无法写入失败状态: ${fileId}`)
          return
        }
        throw e
      }
      this.logger.error(`文件解析失败: ${fileId}`, err as Error)
    } finally {
      if (cosTempFile && fs.existsSync(cosTempFile)) {
        try {
          fs.unlinkSync(cosTempFile)
        } catch {
          /* ignore */
        }
      }
      await this.cleanupChunkDirAfterParse(fileId)
    }
  }

  /** 解析结束（成功/失败）后删除本分片上传临时目录，释放轻量云磁盘 */
  private async cleanupChunkDirAfterParse(fileId: string): Promise<void> {
    try {
      const row = await this.prisma.uploadedFile.findUnique({
        where: { id: fileId },
        select: { uploaderId: true },
      })
      if (!row) return
      const chunkDir = this.chunkSessionDir(row.uploaderId, fileId)
      if (fs.existsSync(chunkDir)) {
        fs.rmSync(chunkDir, { recursive: true, force: true })
        this.logger.debug(`解析后已清理分片目录: ${chunkDir}`)
      }
    } catch (e) {
      this.logger.warn(`解析后清理分片目录失败 fileId=${fileId}`, e as Error)
    }
  }

  /**
   * 图片：优先混元多模态；默认不再走腾讯云 OCR（与 PDF 一致，上传解析统一混元）。
   * 应急：设置 FILE_PARSE_TENCENT_OCR_FALLBACK=1 恢复混元失败后的腾讯云 OCR。
   * 不再走本地视觉模型与 Tesseract。
   */
  private async parseImageVisionThenOcr(
    filePath: string,
    mimeType: string,
    heartbeat: (stage: string, progress?: Record<string, unknown>) => Promise<void>,
    /** 数据库 path（可能为 cos://…），用于混元直读 COS 公网 URL */
    storedPathForCos: string,
    uploaderId: string | null,
  ): Promise<string> {
    const stImg = fs.statSync(filePath)
    await heartbeat('HUNYUAN_COS_MULTIMODAL', {
      phase: 'VISION',
      message: 'hunyuan_cos_start',
      source: 'image',
    })
    const res = await this.multimodal.tryDirectCosMultimodal({
      moduleType: 'FILE_PARSE',
      fileKind: 'IMAGE',
      userId: uploaderId ?? 'system',
      storedPath: storedPathForCos,
      localPath: filePath,
      fileBytes: stImg.size,
    })
    if (res?.text?.trim()) {
      const body = res.text
      const minChars = parseInt(this.config.get<string>('HUNYUAN_COS_MULTIMODAL_MIN_OUTPUT_CHARS') || '40', 10)
      const floor = Number.isFinite(minChars) && minChars > 0 ? minChars : 40
      if (body.trim().length >= floor) {
        await heartbeat('HUNYUAN_COS_MULTIMODAL_DONE', {
          phase: 'VISION',
          message: 'hunyuan_cos_done',
          chars: body.length,
          cacheHit: res.cacheHit,
        })
        return `【混元多模态直读｜COS】\n${body.trim()}`
      }
      this.logger.warn(`混元 COS 图片多模态正文过短（${body.trim().length} < ${floor}），准备降级腾讯云 OCR`)
    } else {
      await heartbeat('HUNYUAN_COS_MULTIMODAL_FALLBACK', {
        phase: 'VISION',
        message: 'hunyuan_cos_fallback',
      })
    }

    throw new Error(
      '【解析失败】图片解析仅允许混元主链路：混元未返回有效正文或正文过短。请检查 HUNYUAN_VISION_API_KEY（或 HUNYUAN_OPENAI_API_KEY）、HUNYUAN_MULTIMODAL_ENABLED/HUNYUAN_COS_MULTIMODAL_PARSE_ENABLED、HUNYUAN_COS_MULTIMODAL_MIN_OUTPUT_CHARS，并确认文件已成功上传到 COS。',
    )
  }

  /**
   * FILE_PARSE_FORCE_HUNYUAN=1：上传文件解析阶段须由混元多模态产出理解结果，
   * 不因 MM 关闭/超预算跳过混元（见 MultimodalService）；且混元失败时不降级腾讯云 OCR，除非 FILE_PARSE_TENCENT_OCR_FALLBACK=1。
   */
  private isFileParseForceHunyuan(): boolean {
    return this.config.get<string>('FILE_PARSE_FORCE_HUNYUAN')?.trim() === '1'
  }

  /** 是否允许混元失败后走腾讯云 OCR（PDF/图片）；默认不允许 = 上传解析统一混元 */
  private isFileParseTencentOcrFallbackAllowed(): boolean {
    return this.config.get<string>('FILE_PARSE_TENCENT_OCR_FALLBACK')?.trim() === '1'
  }

  /** 上传解析是否仅走混元（不允许腾讯云 OCR 兜底） */
  private isFileParseHunyuanOnlyForUpload(): boolean {
    return this.isFileParseForceHunyuan() || !this.isFileParseTencentOcrFallbackAllowed()
  }

  /**
   * 混元失败后是否允许本机分页 OCR（Tesseract/可选视觉）兜底。
   * 默认：未设 FILE_PARSE_FORCE_HUNYUAN=1 时启用；显式 FILE_PARSE_LOCAL_OCR_FALLBACK=0 可关闭。
   */
  private isFileParseLocalOcrFallbackAllowed(): boolean {
    const v = this.config.get<string>('FILE_PARSE_LOCAL_OCR_FALLBACK')?.trim()
    if (v === '0') return false
    if (v === '1') return true
    return !this.isFileParseForceHunyuan()
  }

  /** 将底层 OCR 异常映射为前端可展示的简短原因 */
  private classifyOcrFailureMessage(err: unknown): string {
    const m = (err as Error)?.message ?? ''
    if (/timeout|超过|ETIMEDOUT/i.test(m)) return '网络或处理超时'
    if (/sharp|预处理/i.test(m)) return '图片预处理失败'
    if (/empty|结果为空/i.test(m)) return '未识别到文字，可能图片模糊或对比度过低'
    return '识别失败'
  }

  private sanitizeParsedText(text: string): string {
    return text.split('\0').join('')
  }

  private enrichParsedContentWithFlowchart(
    parsedContent: string,
    structuredRequirements: string[],
  ): { parsedContent: string; structuredRequirements: string[] } {
    const context = this.pdfFlowchartParse.parseFromText(parsedContent)
    const summary = this.pdfFlowchartParse.toPromptContext(context)
    if (!summary) {
      return { parsedContent, structuredRequirements }
    }

    const bodyWithoutOldSummary = parsedContent
      .replace(/\n{0,2}## 流程图结构化摘要[\s\S]*$/u, '')
      .trim()
    const mergedRequirements = [
      ...structuredRequirements,
      ...(context!.mainPath.length ? [`流程图主流程需覆盖：${context!.mainPath.join(' -> ')}`] : []),
      ...context!.branches.slice(0, 12).map((branch) => `流程图分支需覆盖：${branch.from} -- ${branch.condition} --> ${branch.to}`),
    ]
      .map((item) => item.trim())
      .filter(Boolean)

    return {
      parsedContent: `${bodyWithoutOldSummary}\n\n${summary}`.trim(),
      structuredRequirements: Array.from(new Set(mergedRequirements)).slice(0, 120),
    }
  }

  /**
   * 尝试混元 COS 多模态直读 PDF；成功则返回「混元理解在前 + 可选内置文本层附录」，失败返回 null。
   */
  private async tryPdfHunyuanCosMultimodalBody(
    filePath: string,
    heartbeat: (stage: string, progress?: Record<string, unknown>) => Promise<void>,
    ctx: {
      fileId: string
      fileBytes: number
      parseRetryHint: string | null
      originalStoredPath?: string
      uploaderId?: string | null
    },
    embeddedTextLayer: string,
  ): Promise<string | null> {
    if (!ctx.originalStoredPath) return null
    await heartbeat('HUNYUAN_COS_MULTIMODAL', {
      phase: 'VISION',
      message: 'hunyuan_cos_start',
      source: 'pdf',
    })
    let res: Awaited<ReturnType<MultimodalService['tryDirectCosMultimodal']>>
    try {
      res = await this.multimodal.tryDirectCosMultimodal({
        moduleType: 'FILE_PARSE',
        fileKind: 'PDF',
        userId: ctx.uploaderId ?? 'system',
        uploadedFileId: ctx.fileId,
        storedPath: ctx.originalStoredPath,
        localPath: filePath,
        fileBytes: ctx.fileBytes,
      })
    } catch (e) {
      if (
        this.shouldRetryPdfWholeFileAsPagedHunyuan(e) &&
        this.documentVision.isPdfPageRenderAvailable()
      ) {
        const reason = sanitizeErrorMessageForClient(
          (e as Error).message || String(e),
          400,
        )
        this.logger.warn(`PDF：整本混元直传失败，自动切换分页混元：${reason}`)
        await heartbeat('HUNYUAN_COS_MULTIMODAL_FALLBACK', {
          phase: 'VISION',
          message: 'hunyuan_cos_pdf_retry_paged',
        })
        const hunyuanPaged = await this.tryPdfHunyuanPagedVisionBatches(filePath, heartbeat)
        if (hunyuanPaged?.text?.trim()) {
          const merged = this.mergePdfVisionWithEmbeddedLayer(hunyuanPaged.text, embeddedTextLayer)
          await heartbeat('HUNYUAN_COS_MULTIMODAL_DONE', {
            phase: 'VISION',
            message: 'hunyuan_pdf_page_batch_done',
            chars: merged.length,
          })
          this.logger.log(`PDF：整本混元失败后，分页混元回退成功（chars=${merged.length}）`)
          return merged
        }
        return null
      }
      throw e
    }
    if (res?.text?.trim()) {
      const body = res.text
      const minChars = parseInt(
        this.config.get<string>('HUNYUAN_COS_MULTIMODAL_MIN_OUTPUT_CHARS_PDF') || '40',
        10,
      )
      const floor = Number.isFinite(minChars) && minChars > 0 ? minChars : 40
      if (body.trim().length >= floor && !isGenericHunyuanPlaceholderOutput(body)) {
        await heartbeat('HUNYUAN_COS_MULTIMODAL_DONE', {
          phase: 'VISION',
          message: 'hunyuan_cos_done',
          chars: body.length,
          cacheHit: res.cacheHit,
        })
        const embedded = embeddedTextLayer.trim()
        const parts: string[] = [`【混元多模态直读｜COS PDF】\n${body.trim()}`]
        if (embedded) {
          parts.push(`【PDF 内置文本层（原文检索备用）】\n${embedded}`)
        }
        this.logger.log(
          `PDF：混元 COS 多模态直读成功（${body.trim().length} 字），内置文本层约 ${embedded.length} 字已附录`,
        )
        return parts.join('\n\n')
      }
      if (isGenericHunyuanPlaceholderOutput(body)) {
        this.logger.warn('混元 COS PDF 多模态输出疑似模板占位，继续后续流程')
      } else {
        this.logger.warn(`混元 COS PDF 多模态正文过短（${body.trim().length} < ${floor}），继续后续流程`)
      }
    }
    await heartbeat('HUNYUAN_COS_MULTIMODAL_FALLBACK', {
      phase: 'VISION',
      message: 'hunyuan_cos_pdf_fallback',
    })
    return null
  }

  /** 默认 true：PDF 上传解析先整本走混元理解，不再先跑 pdf-parse 文本层探测（设 FILE_PARSE_PDF_HUNYUAN_FIRST=0 恢复旧顺序） */
  private fileParsePdfHunyuanFirst(): boolean {
    return this.config.get<string>('FILE_PARSE_PDF_HUNYUAN_FIRST')?.trim() !== '0'
  }

  private shouldRetryPdfWholeFileAsPagedHunyuan(err: unknown): boolean {
    const raw = ((err as Error)?.message || String(err)).toLowerCase()
    return (
      raw.includes('image download failed') ||
      (raw.includes('data/base64') && raw.includes('pdf')) ||
      (raw.includes('整本') && raw.includes('base64'))
    )
  }

  private buildPdfTileVisionExtractionPrompt(tileIndex: number, tileTotal: number): string {
    return `你是交互稿视觉转录助手。当前图片是单页大画布 PDF 切出的局部区域（第 ${tileIndex}/${tileTotal} 块）。

任务：逐行转录该局部里真实可见的中文/英文文案、表格内容、字段名、状态名、按钮文案、标注说明、流程节点、版本信息。该局部通常来自交互稿、活动页、流程稿，不要写概括性介绍。

硬性规则：
1. 只写看得清的内容；看不清写“未能识别”，禁止脑补。
2. 禁止写“这是一个页面/流程图/示意图”“上方多个界面截图”“中间部分为流程图”这种泛泛描述，优先写实际文字。
3. 如果有表格，尽量还原为 Markdown 表格。
4. 如果有标注线或备注，按条列出原文。
5. 不要输出需求总结，不要写结论，不要写“通过以上转录，可以初步了解”。
6. 如果看到多个小界面/多个状态，请分别列出每个界面里能识别的文案，不要合并成一句概述。

输出 Markdown，以“## 局部 ${tileIndex} 转录”开头。`
  }

  /**
   * PDF 分页渲染 + 视觉分批（依赖 pdf-to-img/canvas）开关。
   * 为避免某些服务器环境下 native 依赖异常导致进程崩溃，默认关闭，需显式设 1 开启。
   */
  private fileParsePdfPagedVisionEnabled(): boolean {
    return this.config.get<string>('FILE_PARSE_PDF_PAGED_VISION')?.trim() === '1'
  }

  /** 大 PDF 或显式开关时优先分页混元，避免整本 data:pdf;base64 触发混元 image download failed */
  private shouldPreferPdfPagedHunyuan(fileBytes: number): boolean {
    if (this.fileParsePdfPagedVisionEnabled()) return true
    if (!this.documentVision.isPdfPageRenderAvailable()) return false
    return isPdfTooLargeForHunyuanWholeFileBase64(this.config, fileBytes)
  }

  /**
   * PDF 按页渲 PNG，再分批调用混元多模态（OpenAI 兼容通道）。
   */
  private async tryPdfHunyuanPagedVisionBatches(
    filePath: string,
    heartbeat: (stage: string, progress?: Record<string, unknown>) => Promise<void>,
    options?: { maxPages?: number },
  ): Promise<{ text: string } | null> {
    if (!this.documentVision.isPdfPageRenderAvailable()) return null
    if (!isHunyuanMultimodalEnabled(this.config) || !resolveHunyuanVisionApiKey(this.config)) {
      return null
    }

    const batchRaw = parseInt(this.config.get<string>('HUNYUAN_PDF_BATCH_PAGES') || '1', 10)
    const batchPages = Number.isFinite(batchRaw) && batchRaw > 0 ? Math.min(Math.max(batchRaw, 1), 4) : 1
    const scaleRaw = parseFloat(
      this.config.get<string>('HUNYUAN_PDF_RENDER_SCALE') ||
        this.config.get<string>('VISION_PDF_RENDER_SCALE') ||
        '0.6',
    )
    const renderScale = Math.min(Math.max(scaleRaw || 0.6, 0.5), 3)
    const maxRaw = parseInt(this.config.get<string>('HUNYUAN_PDF_MAX_PAGES') || '60', 10)
    const configuredMaxPages = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.min(Math.max(maxRaw, 1), 200) : 60
    const maxPages =
      options?.maxPages != null
        ? Math.min(Math.max(options.maxPages, 1), configuredMaxPages)
        : configuredMaxPages

    const sections: string[] = []
    let pageTotal = 0
    let batchIndex = 0
    let current: { pageNum: number; buffer: Buffer }[] = []

    const flushBatch = async () => {
      if (current.length === 0) return
      batchIndex++
      const first = current[0].pageNum
      const last = current[current.length - 1].pageNum
      const pagePrompt = buildPdfPagedVisionExtractionPrompt(first, last)
      await heartbeat('HUNYUAN_COS_MULTIMODAL', {
        phase: 'VISION',
        message: 'hunyuan_pdf_page_batch',
        pageCurrent: last,
        pageTotal,
        batchIndex,
      })
      try {
        const out = await runHunyuanOpenAiVisionChatFromImages({
          config: this.config,
          images: current.map((p) => ({ buffer: p.buffer, mime: 'image/png' })),
          prompt: pagePrompt,
        })
        const batchText = out.text.trim()
        if (batchText && !isGenericHunyuanPlaceholderOutput(batchText)) {
          sections.push(`【PDF 第 ${first}-${last} 页｜混元多模态】\n${batchText}`)
        } else if (batchText) {
          this.logger.warn(
            `PDF 混元分页批次 ${batchIndex}（第 ${first}-${last} 页）输出疑似模板占位，已丢弃`,
          )
        }
      } catch (e) {
        this.logger.warn(
          `PDF 混元分页批次 ${batchIndex}（第 ${first}-${last} 页）失败: ${(e as Error).message}`,
        )
      }
      current = []
    }

    try {
      for await (const page of this.documentVision.iteratePdfPagesAsPng(filePath, {
        scale: renderScale,
      })) {
        if (pageTotal >= maxPages) break
        pageTotal++
        current.push(page)
        if (current.length >= batchPages) {
          await flushBatch()
        }
      }
      await flushBatch()
    } catch (e) {
      this.logger.warn(`PDF 混元分页渲染失败: ${(e as Error).message}`)
      return null
    }

    if (sections.length === 0) return null
    return {
      text: `【混元多模态直读｜PDF 分页渲染】\n\n${sections.join('\n\n')}`,
    }
  }

  /**
   * 单页超大交互稿：先渲染整页，再切 tile 逐块送混元，避免整页缩放后小字全丢。
   */
  private async tryPdfSinglePageTiledVisionBatches(
    filePath: string,
    heartbeat: (stage: string, progress?: Record<string, unknown>) => Promise<void>,
    options?: { dense?: boolean },
  ): Promise<{ text: string } | null> {
    if (!this.documentVision.isPdfPageRenderAvailable()) return null
    if (!isHunyuanMultimodalEnabled(this.config) || !resolveHunyuanVisionApiKey(this.config)) {
      return null
    }

    const dense = options?.dense === true
    const scaleKey = dense ? 'HUNYUAN_PDF_TILE_RENDER_SCALE_DENSE' : 'HUNYUAN_PDF_TILE_RENDER_SCALE'
    const scaleDefault = dense ? '2.4' : '1.8'
    const scaleRaw = parseFloat(this.config.get<string>(scaleKey) || scaleDefault)
    const renderScale = Math.min(Math.max(scaleRaw || parseFloat(scaleDefault), 0.8), 3)
    let firstPage: Buffer | null = null
    for await (const page of this.documentVision.iteratePdfPagesAsPng(filePath, { scale: renderScale })) {
      firstPage = page.buffer
      break
    }
    if (!firstPage) return null

    const tileColumns = Math.min(
      Math.max(
        parseInt(
          this.config.get<string>(dense ? 'HUNYUAN_PDF_TILE_COLUMNS_DENSE' : 'HUNYUAN_PDF_TILE_COLUMNS') ||
            (dense ? '4' : '3'),
          10,
        ) || (dense ? 4 : 3),
        1,
      ),
      4,
    )
    const tileRows = Math.min(
      Math.max(
        parseInt(
          this.config.get<string>(dense ? 'HUNYUAN_PDF_TILE_ROWS_DENSE' : 'HUNYUAN_PDF_TILE_ROWS') ||
            (dense ? '4' : '0'),
          10,
        ) || (dense ? 4 : 0),
        0,
      ),
      6,
    )
    const maxTiles = Math.min(
      Math.max(
        parseInt(
          this.config.get<string>(dense ? 'HUNYUAN_PDF_TILE_MAX_TILES_DENSE' : 'HUNYUAN_PDF_TILE_MAX_TILES') ||
            (dense ? '16' : '12'),
          10,
        ) || (dense ? 16 : 12),
        1,
      ),
      24,
    )
    const tiles = await this.documentVision.splitPngIntoTiles(firstPage, {
      columns: tileColumns,
      ...(tileRows > 0 ? { rows: tileRows } : {}),
      maxTiles,
      overlap: dense ? 96 : 72,
      minTileWidth: dense ? 520 : 720,
      minTileHeight: dense ? 520 : 720,
    })
    if (!tiles.length) return null

    const sections: string[] = []
    for (const tile of tiles) {
      await heartbeat('HUNYUAN_COS_MULTIMODAL', {
        phase: 'VISION',
        message: 'hunyuan_pdf_tile_batch',
        tileIndex: tile.index,
        tileTotal: tiles.length,
      })
      try {
        const out = await runHunyuanOpenAiVisionChatFromImages({
          config: this.config,
          images: [{ buffer: tile.buffer, mime: 'image/png' }],
          prompt: this.buildPdfTileVisionExtractionPrompt(tile.index, tiles.length),
        })
        const text = out.text.trim()
        if (text && !isGenericHunyuanPlaceholderOutput(text)) {
          sections.push(`【PDF 局部 ${tile.index}/${tiles.length}】\n${text}`)
        }
      } catch (e) {
        this.logger.warn(`PDF 分块混元第 ${tile.index}/${tiles.length} 块失败: ${(e as Error).message}`)
      }
    }

    if (!sections.length) return null
    return {
      text: `【混元多模态直读｜PDF 分块渲染】\n\n${sections.join('\n\n')}`,
    }
  }

  /**
   * 混元直读未命中后：内置文本层 → 腾讯云 OCR（若允许）→ 本机分页 OCR；均失败再抛错。
   * @param embeddedText 已抽取的内置文本（可为空，供 OCR 侧参考）
   */
  private async finishPdfAfterHunyuanMiss(
    filePath: string,
    heartbeat: (stage: string, progress?: Record<string, unknown>) => Promise<void>,
    ctx: {
      fileId: string
      fileBytes: number
      parseRetryHint: string | null
      originalStoredPath?: string
      uploaderId?: string | null
      skipLocalOcr?: boolean
    },
    embeddedText: string,
    numpages: number,
  ): Promise<string> {
    const embedded = embeddedText.trim()
    const minPartialRaw = parseInt(
      this.config.get<string>('VISION_PDF_MIN_EMBEDDED_FALLBACK_CHARS') || '40',
      10,
    )
    const minPartial =
      Number.isFinite(minPartialRaw) && minPartialRaw > 0 ? minPartialRaw : 40

    if (embedded.length >= minPartial) {
      const suff = this.pdfDocumentParse.evaluateTextLayerSufficiency(embeddedText, numpages)
      if (suff.sufficient) {
        this.logger.log('PDF：混元未命中，使用质量足够的内置文本层')
        return `【PDF 内置文本层】\n${embedded}`
      }
      this.logger.warn(
        `PDF：混元未命中，降级使用部分内置文本层（${embedded.length} 字，未达 ${suff.minLen} 字阈值）`,
      )
      await heartbeat('PDF_EMBEDDED_FALLBACK', {
        phase: 'PDF',
        message: 'embedded_text_partial',
        chars: embedded.length,
      })
      return `【PDF 内置文本层（混元未命中，以下为 PDF 抽取原文，可能不完整）】\n${embedded}`
    }

    if (this.isFileParseTencentOcrFallbackAllowed()) {
      await heartbeat('PDF_OCR_TENCENT', { phase: 'OCR', message: 'tencent_fallback' })
      try {
        const tencent = await this.pdfDocumentParse.runTencentFullPdfOcr(
          filePath,
          embeddedText,
          numpages,
          heartbeat,
          { originalStoredPath: ctx.originalStoredPath },
        )
        if (tencent?.trim()) {
          this.logger.log('PDF：混元未命中，腾讯云 OCR 兜底成功')
          return tencent
        }
      } catch (e) {
        this.logger.warn(`PDF：腾讯云 OCR 兜底失败: ${(e as Error).message}`)
      }
    }

    if (
      !ctx.skipLocalOcr &&
      this.isFileParseLocalOcrFallbackAllowed() &&
      this.documentVision.isPdfPageRenderAvailable()
    ) {
      await heartbeat('PDF_OCR_LOCAL', { phase: 'OCR', message: 'local_ocr_fallback' })
      try {
        const singlePageNoText =
          numpages <= 1 &&
          !this.pdfDocumentParse.evaluateTextLayerSufficiency(embeddedText, numpages).sufficient
        const ocrScaleRaw = parseFloat(
          this.config.get<string>(
            singlePageNoText ? 'PDF_OCR_RENDER_SCALE_SINGLE_PAGE' : 'PDF_OCR_RENDER_SCALE',
          ) || (singlePageNoText ? '2.2' : '0.6'),
        )
        const ocrRenderScale = Math.min(
          Math.max(ocrScaleRaw || (singlePageNoText ? 2.2 : 0.6), 0.6),
          3,
        )
        const ocr = await this.parsePdfOcrBatchedPipeline(
          filePath,
          embeddedText,
          heartbeat,
          ctx.fileId,
          numpages,
          { renderScale: ocrRenderScale },
        )
        if (ocr?.trim()) {
          this.logger.log('PDF：混元未命中，本机 OCR 管线兜底成功')
          return ocr
        }
      } catch (e) {
        this.logger.warn(`PDF：本机 OCR 管线失败: ${(e as Error).message}`)
      }
    } else if (
      !this.isFileParseLocalOcrFallbackAllowed() &&
      !this.isFileParseTencentOcrFallbackAllowed()
    ) {
      this.logger.warn(
        'PDF：混元未命中且未启用 OCR 兜底（FILE_PARSE_LOCAL_OCR_FALLBACK=0 且未设 FILE_PARSE_TENCENT_OCR_FALLBACK=1）',
      )
    }

    if (isPdfTooLargeForHunyuanWholeFileBase64(this.config, ctx.fileBytes)) {
      throw new Error(
        '【解析失败】PDF 体积较大，混元分页未产出有效正文，且 OCR 兜底未成功。请确认 backend 镜像已安装 canvas；可设 FILE_PARSE_LOCAL_OCR_FALLBACK=1（默认已开）或 FILE_PARSE_TENCENT_OCR_FALLBACK=1。',
      )
    }
    throw new Error(
      '【解析失败】混元未返回足够长的有效正文，且内置文本层/OCR 兜底均未成功。请核对 HUNYUAN_VISION_API_KEY、混元开关与 COS 配置；扫描件 PDF 需本机 OCR（FILE_PARSE_LOCAL_OCR_FALLBACK，默认开启）或腾讯云 OCR（FILE_PARSE_TENCENT_OCR_FALLBACK=1）。',
    )
  }

  /**
   * PDF：默认整本先走混元多模态理解与结构化需求报告（prompt 见 multimodalAnalysis），
   * 不再先跑 pdf-parse 内置文本层探测；混元失败后再抽文本层并走腾讯云 OCR 兜底（若允许）。
   * 设 FILE_PARSE_PDF_HUNYUAN_FIRST=0 恢复「先文本层再混元」。
   * 「仅内置文本」重试（parseRetryHint=text_only）仍为显式分支，与 FILE_PARSE_FORCE_HUNYUAN 互斥。
   */
  private async parsePdfWithVisionFallback(
    filePath: string,
    heartbeat: (stage: string, progress?: Record<string, unknown>) => Promise<void>,
    ctx: {
      fileId: string
      fileBytes: number
      parseRetryHint: string | null
      originalStoredPath?: string
      uploaderId?: string | null
      skipLocalOcr?: boolean
    },
  ): Promise<string> {
    let embeddedText = ''
    let numpages = 0
    let embeddedSufficient = false
    try {
      const layer = await this.pdfDocumentParse.extractTextLayerWithMeta(filePath)
      embeddedText = layer.text || ''
      numpages = layer.numpages
      if (embeddedText.trim()) {
        embeddedSufficient = this.pdfDocumentParse.evaluateTextLayerSufficiency(
          embeddedText,
          numpages,
        ).sufficient
        this.logger.log(
          `PDF：内置文本层 ${embeddedText.trim().length} 字 / ${numpages} 页（sufficient=${embeddedSufficient}）`,
        )
      }
    } catch (e) {
      this.logger.warn(`PDF：抽取内置文本层失败: ${(e as Error).message}`)
    }

    const sizeMb = ctx.fileBytes / (1024 * 1024)
    const fastStrategy = decidePdfParseStrategy({
      fileBytes: ctx.fileBytes,
      numpages,
      embeddedTextChars: embeddedText.trim().length,
      embeddedSufficient,
      parseRetryHint: ctx.parseRetryHint,
      env: {
        FILE_PARSE_PDF_FAST_MODE: this.config.get<string>('FILE_PARSE_PDF_FAST_MODE'),
        FILE_PARSE_PDF_FAST_MAX_MB: this.config.get<string>('FILE_PARSE_PDF_FAST_MAX_MB'),
        FILE_PARSE_PDF_FAST_MAX_PAGES: this.config.get<string>('FILE_PARSE_PDF_FAST_MAX_PAGES'),
        FILE_PARSE_PDF_FAST_VISION_PAGES: this.config.get<string>('FILE_PARSE_PDF_FAST_VISION_PAGES'),
        FILE_PARSE_PDF_HUNYUAN_FIRST: this.config.get<string>('FILE_PARSE_PDF_HUNYUAN_FIRST'),
      },
    })
    await heartbeat('PDF', {
      phase: 'PDF',
      fileBytes: ctx.fileBytes,
      strategy: fastStrategy.mode,
      reason: fastStrategy.reason,
      message: 'hunyuan_primary',
      ...(sizeMb > 5
        ? { etaMinutes: Math.max(1, Math.ceil(sizeMb * 0.6)), largePdf: true }
        : {}),
    })

    if (fastStrategy.mode === 'text_only') {
      await heartbeat('PDF_EMBEDDED_PRIMARY', {
        phase: 'PDF',
        message: 'embedded_text_only_retry',
        chars: embeddedText.trim().length,
        numpages,
      })
      return `【PDF 内置文本层】\n${embeddedText.trim()}`
    }

    if (fastStrategy.mode === 'embedded_text_fast' || (!this.fileParsePdfHunyuanFirst() && embeddedSufficient)) {
      this.logger.log(`PDF：使用内置文本层快速路径，跳过混元优先链路（strategy=${fastStrategy.mode}）`)
      await heartbeat('PDF_EMBEDDED_PRIMARY', {
        phase: 'PDF',
        message: fastStrategy.mode === 'embedded_text_fast' ? 'embedded_text_fast' : 'embedded_text_primary',
        chars: embeddedText.trim().length,
        numpages,
      })
      return `【PDF 内置文本层｜快速解析】\n${embeddedText.trim()}`
    }

    const fastCtx = { ...ctx, skipLocalOcr: ctx.skipLocalOcr || fastStrategy.skipLocalOcr }
    const shouldDenseTileSinglePage = numpages <= 1 && !embeddedSufficient

    if (numpages <= 1 && (this.shouldPreferPdfPagedHunyuan(ctx.fileBytes) || fastStrategy.mode === 'flowchart_vision_fast')) {
      const tiled = await this.tryPdfSinglePageTiledVisionBatches(filePath, heartbeat, {
        dense: shouldDenseTileSinglePage,
      })
      if (tiled?.text?.trim()) {
        const merged = this.mergePdfVisionWithEmbeddedLayer(tiled.text, embeddedText)
        await heartbeat('HUNYUAN_COS_MULTIMODAL_DONE', {
          phase: 'VISION',
          message: 'hunyuan_pdf_tile_done',
          chars: merged.length,
        })
        this.logger.log(`PDF：单页大画布分块混元成功（chars=${merged.length}）`)
        return merged
      }
      if (!embeddedSufficient) {
        this.logger.warn('PDF：单页交互稿未获得有效分块正文，跳过整页分页概述，转 OCR/文本兜底')
        return this.finishPdfAfterHunyuanMiss(filePath, heartbeat, fastCtx, embeddedText, numpages)
      }
    }

    if (this.shouldPreferPdfPagedHunyuan(ctx.fileBytes) || fastStrategy.mode === 'flowchart_vision_fast') {
      if (!this.documentVision.isPdfPageRenderAvailable()) {
        this.logger.warn(
          'PDF 需分页混元解析，但 canvas 不可用；将尝试整本直传（大文件可能失败）。请重建含 canvas 的 backend 镜像或配置 FILE_PARSE_TENCENT_OCR_FALLBACK=1',
        )
      } else {
        const hunyuanPaged = await this.tryPdfHunyuanPagedVisionBatches(filePath, heartbeat, {
          maxPages: fastStrategy.maxVisionPages,
        })
        if (hunyuanPaged?.text?.trim()) {
          const minChars = parseInt(
            this.config.get<string>('HUNYUAN_COS_MULTIMODAL_MIN_OUTPUT_CHARS_PDF') || '40',
            10,
          )
          const floor = Number.isFinite(minChars) && minChars > 0 ? minChars : 40
          if (
            hunyuanPaged.text.trim().length >= floor &&
            !isGenericHunyuanPlaceholderOutput(hunyuanPaged.text)
          ) {
            const merged = this.mergePdfVisionWithEmbeddedLayer(hunyuanPaged.text, embeddedText)
            await heartbeat('HUNYUAN_COS_MULTIMODAL_DONE', {
              phase: 'VISION',
              message: 'hunyuan_pdf_page_batch_done',
              chars: merged.length,
            })
            this.logger.log(
              `PDF：混元分页渲染主解析成功（chars=${merged.length}）`,
            )
            return merged
          }
          if (isGenericHunyuanPlaceholderOutput(hunyuanPaged.text)) {
            this.logger.warn('PDF：混元分页输出疑似模板占位，继续后续链路')
          } else {
            this.logger.warn(`PDF：混元分页正文过短（< ${floor} 字），继续后续链路`)
          }
        } else {
          this.logger.warn('PDF：混元分页链路未返回有效正文')
        }

        if (this.fileParsePdfPagedVisionEnabled()) {
          const visionPaged = await this.documentVision.transcribePdfByVisionBatches(
            filePath,
            async (p) => {
              await heartbeat('HUNYUAN_COS_MULTIMODAL', {
                phase: 'VISION',
                message: 'gateway_pdf_page_batch',
                pageCurrent: p.pageCurrent,
                pageTotal: p.pageTotal,
                batchIndex: p.batchIndex,
                batchTotal: p.batchTotal,
              })
            },
          )
          if (visionPaged?.text?.trim()) {
            await heartbeat('HUNYUAN_COS_MULTIMODAL_DONE', {
              phase: 'VISION',
              message: 'gateway_pdf_page_batch_done',
              chars: visionPaged.text.length,
            })
            return visionPaged.text
          }
        }
      }
    }

    if (isPdfTooLargeForHunyuanWholeFileBase64(this.config, ctx.fileBytes)) {
      return this.finishPdfAfterHunyuanMiss(filePath, heartbeat, fastCtx, embeddedText, numpages)
    }

    if (fastStrategy.mode === 'flowchart_vision_fast') {
      this.logger.warn('PDF：快速流程图视觉未产出有效正文，跳过整本混元直传，进入轻量兜底')
      return this.finishPdfAfterHunyuanMiss(filePath, heartbeat, fastCtx, embeddedText, numpages)
    }

    const hunyuanBody = await this.tryPdfHunyuanCosMultimodalBody(
      filePath,
      heartbeat,
      ctx,
      embeddedText,
    )
    if (hunyuanBody) return hunyuanBody

    if (embeddedSufficient) {
      this.logger.log('PDF：混元未命中，使用质量足够的内置文本层')
      return `【PDF 内置文本层】\n${embeddedText.trim()}`
    }

    return this.finishPdfAfterHunyuanMiss(filePath, heartbeat, fastCtx, embeddedText, numpages)
  }

  private mergePdfVisionWithEmbeddedLayer(visionText: string, embeddedText: string): string {
    const vision = visionText.trim()
    const embedded = embeddedText.trim()
    if (!embedded) return vision
    if (!vision) return `【PDF 内置文本层】\n${embedded}`
    return `${vision}\n\n【PDF 内置文本层（原文检索备用）】\n${embedded}`
  }

  private getOcrBatchSize(): number {
    const n = parseInt(this.config.get<string>('PDF_OCR_BATCH_SIZE') || '5', 10)
    return Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, 1), 20) : 5
  }

  private getOcrMaxConcurrentBatches(): number {
    const n = parseInt(this.config.get<string>('PDF_OCR_MAX_CONCURRENT_BATCHES') || '2', 10)
    return Number.isFinite(n) && n > 0 ? Math.min(n, 8) : 2
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }

  private async retryPdfShard<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const retries = parseInt(this.config.get<string>('PDF_OCR_SHARD_RETRIES') || '2', 10)
    const delayMs = parseInt(this.config.get<string>('PDF_OCR_SHARD_RETRY_DELAY_MS') || '5000', 10)
    const maxAttempts = Number.isFinite(retries) && retries >= 0 ? retries + 1 : 3
    const delay = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 5000
    let lastErr: Error | undefined
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn()
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e))
        this.logger.warn(`${label} 第 ${attempt}/${maxAttempts} 次失败: ${lastErr.message}`)
        if (attempt < maxAttempts) await this.sleep(delay)
      }
    }
    throw lastErr ?? new Error(`${label} 失败`)
  }

  private async runPool<T, R>(
    items: T[],
    limit: number,
    worker: (item: T, idx: number) => Promise<R>,
  ): Promise<R[]> {
    if (items.length === 0) return []
    const results = new Array<R>(items.length)
    let nextIndex = 0
    const workerFn = async () => {
      for (;;) {
        const idx = nextIndex++
        if (idx >= items.length) return
        results[idx] = await worker(items[idx], idx)
      }
    }
    const pool = Math.min(Math.max(limit, 1), items.length)
    await Promise.all(Array.from({ length: pool }, () => workerFn()))
    return results
  }

  /** 增量解析：拆出前若干页的批次，便于先落库快照再继续后台识别 */
  private splitBatchesForIncremental(
    batches: { pageNum: number; buffer: Buffer }[][],
    snapshotThroughPage: number,
  ): [{ pageNum: number; buffer: Buffer }[][], { pageNum: number; buffer: Buffer }[][]] {
    if (!batches.length) return [[], []]
    let cut = 0
    let maxP = 0
    for (let i = 0; i < batches.length; i++) {
      const batchMax = Math.max(...batches[i].map((x) => x.pageNum))
      maxP = Math.max(maxP, batchMax)
      cut = i + 1
      if (maxP >= snapshotThroughPage) break
    }
    if (cut >= batches.length) return [batches, []]
    return [batches.slice(0, cut), batches.slice(cut)]
  }

  private combineOcrBatchSections(results: { section: string; failedPages: number[] }[]): {
    sectionsText: string
    failedPages: number[]
  } {
    const failed: number[] = []
    const sections: string[] = []
    for (const br of results) {
      sections.push(br.section)
      failed.push(...br.failedPages)
    }
    return {
      sectionsText: sections.join('\n\n'),
      failedPages: [...new Set(failed)].sort((a, b) => a - b),
    }
  }

  private buildPdfOcrBody(
    embeddedText: string,
    ocrSections: string,
    failedPages: number[],
  ): string {
    const parts: string[] = []
    if (embeddedText.trim()) {
      parts.push(
        `【PDF 内置文本层（质量不足或为空；已启用分页 OCR）】\n${embeddedText.trim()}`,
      )
    }
    parts.push(`【PDF 分页识别】\n${ocrSections}`)
    if (failedPages.length) {
      parts.push(
        `【PDF 解析备注】以下页面自动识别失败，建议对照原稿核对：第 ${failedPages.join('、')} 页`,
      )
    }
    return parts.join('\n\n')
  }

  private async saveIncrementalSnapshot(
    fileId: string,
    markdown: string,
    meta: Record<string, unknown>,
  ) {
    try {
      await this.prisma.uploadedFile.update({
        where: { id: fileId },
        data: {
          parsedContent:
            markdown +
            '\n\n---\n【增量解析】剩余页面仍在后台识别中，完成后将自动替换为完整结果；也可稍后刷新页面。',
          structuredRequirements: Prisma.DbNull,
          status: FileStatus.PARSING,
          parseStage: 'PDF_OCR_PARTIAL',
          parseProgress: { ...meta, incremental: true, phase: 'OCR' } as Prisma.InputJsonValue,
          lastHeartbeatAt: new Date(),
        },
      })
      this.logger.log(`PDF 增量快照已写入 file=${fileId}`)
    } catch (e) {
      this.logger.warn(`增量快照写入失败: ${(e as Error).message}`)
    }
  }

  private async parsePdfOcrBatchedPipeline(
    filePath: string,
    embeddedText: string,
    heartbeat: (stage: string, progress?: Record<string, unknown>) => Promise<void>,
    fileId: string,
    totalPagesHint: number,
    options?: { renderScale?: number },
  ): Promise<string> {
    await heartbeat('PDF_OCR_PIPELINE', {
      phase: 'OCR',
      pageTotal: totalPagesHint,
      pageCurrent: 0,
      message: 'ocr_start',
    })
    const batchSize = this.getOcrBatchSize()
    const maxConc = this.getOcrMaxConcurrentBatches()

    const batches: { pageNum: number; buffer: Buffer }[][] = []
    let cur: { pageNum: number; buffer: Buffer }[] = []

    try {
      for await (const page of this.documentVision.iteratePdfPagesAsPng(filePath, {
        ...(options?.renderScale != null ? { scale: options.renderScale } : {}),
      })) {
        cur.push(page)
        if (cur.length >= batchSize) {
          batches.push(cur)
          cur = []
        }
      }
      if (cur.length) batches.push(cur)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.logger.error(`PDF 分页渲染失败: ${msg}`)
      throw new Error(`【解析失败】PDF 分页渲染失败：${msg}`)
    }

    if (batches.length === 0) {
      throw new Error('【解析失败】PDF 无页面或无法渲染（0 页）。')
    }

    const lastPageNum = batches[batches.length - 1][batches[batches.length - 1].length - 1].pageNum
    const incrementalThreshold = parseInt(
      this.config.get<string>('PDF_INCREMENTAL_THRESHOLD_PAGES') || '50',
      10,
    )
    const snapshotPages = parseInt(this.config.get<string>('PDF_INCREMENTAL_SNAPSHOT_PAGES') || '10', 10)
    const thr = Number.isFinite(incrementalThreshold) && incrementalThreshold > 0 ? incrementalThreshold : 50
    const snap = Number.isFinite(snapshotPages) && snapshotPages > 0 ? snapshotPages : 10

    this.logger.log(`PDF OCR：共 ${batches.length} 批，每批最多 ${batchSize} 页，并发 ${maxConc}，约 ${lastPageNum} 页`)

    const globalBatchTotal = batches.length

    const runBatch = async (
      batch: { pageNum: number; buffer: Buffer }[],
      idx: number,
    ) => {
      const first = batch[0].pageNum
      const last = batch[batch.length - 1].pageNum
      await heartbeat(`PDF_OCR_P${first}_${last}`, {
        phase: 'OCR',
        pageCurrent: last,
        pageTotal: lastPageNum || totalPagesHint,
        batchIndex: idx + 1,
        batchTotal: globalBatchTotal,
        etaMinutes: Math.max(1, Math.ceil(((globalBatchTotal - idx - 1) * 45) / 60)),
      })
      this.logger.log(`PDF OCR 批次 ${idx + 1}/${globalBatchTotal}：第 ${first}–${last} 页`)
      return this.processSinglePdfOcrBatch(batch)
    }

    let batchResults: { section: string; failedPages: number[] }[]

    if (lastPageNum >= thr && batches.length > 1) {
      const [firstPart, restPart] = this.splitBatchesForIncremental(batches, snap)
      if (firstPart.length && restPart.length) {
        const firstRes = await this.runPool(firstPart, maxConc, (b, i) => runBatch(b, i))
        const mergedFirst = this.combineOcrBatchSections(firstRes)
        const interimMd = this.buildPdfOcrBody(
          embeddedText,
          mergedFirst.sectionsText,
          mergedFirst.failedPages,
        )
        await this.saveIncrementalSnapshot(fileId, interimMd, {
          pageCurrent: Math.max(...firstPart.flatMap((b) => b.map((p) => p.pageNum))),
          pageTotal: lastPageNum,
        })
        const restRes = await this.runPool(restPart, maxConc, (b, i) =>
          runBatch(b, firstPart.length + i),
        )
        batchResults = [...firstRes, ...restRes]
      } else {
        batchResults = await this.runPool(batches, maxConc, (b, i) => runBatch(b, i))
      }
    } else {
      batchResults = await this.runPool(batches, maxConc, (b, i) => runBatch(b, i))
    }

    const merged = this.combineOcrBatchSections(batchResults)
    return this.buildPdfOcrBody(embeddedText, merged.sectionsText, merged.failedPages)
  }

  private async processSinglePdfOcrBatch(
    pages: { pageNum: number; buffer: Buffer }[],
  ): Promise<{ section: string; failedPages: number[] }> {
    const first = pages[0].pageNum
    const last = pages[pages.length - 1].pageNum
    const header = `--- PDF 第 ${first}–${last} 页 ---`
    const skipVision = this.config.get<string>('PDF_OCR_SKIP_VISION') === '1'

    let visionText = ''
    if (!skipVision) {
      const cfg = await this.documentVision.resolveVisionModel()
      if (cfg) {
        try {
          visionText = await this.retryPdfShard(`PDF 视觉批次 ${first}-${last}`, () =>
            this.documentVision.transcribeMultiplePngBuffers(
              cfg,
              pages.map((p) => p.buffer),
            ),
          )
        } catch (e) {
          this.logger.warn(`PDF 视觉批次 ${first}-${last} 最终失败，将使用 Tesseract: ${(e as Error).message}`)
        }
      }
    }

    if (visionText.trim()) {
      return { section: `${header}\n${visionText.trim()}`, failedPages: [] }
    }

    const failedPages: number[] = []
    const chunks: string[] = []
    for (const { pageNum, buffer } of pages) {
      try {
        const t = await this.retryPdfShard(`PDF Tesseract 第 ${pageNum} 页`, () =>
          this.ocrPngBuffer(buffer),
        )
        chunks.push(`（第 ${pageNum} 页）\n${t.trim() || '（本页无文本）'}`)
      } catch {
        failedPages.push(pageNum)
        chunks.push(`（第 ${pageNum} 页）\n（本页 OCR 失败）`)
      }
    }

    return {
      section: `${header}\n${chunks.join('\n\n')}`,
      failedPages,
    }
  }

  /**
   * PNG Buffer：可选 Paddle OCR HTTP → ImageOcrPipeline（预处理/缓存/分块/Tesseract 池）
   */
  private async ocrPngBuffer(buffer: Buffer): Promise<string> {
    const paddleBase = this.config.get<string>('PADDLE_OCR_SERVICE_URL')?.trim()
    if (paddleBase) {
      try {
        const timeoutMs = parseInt(this.config.get<string>('PADDLE_OCR_TIMEOUT_MS') || '120000', 10)
        const { data } = await axios.post<{ text?: string }>(
          `${paddleBase.replace(/\/+$/, '')}/ocr`,
          { image_base64: buffer.toString('base64') },
          { timeout: Number.isFinite(timeoutMs) && timeoutMs > 5000 ? timeoutMs : 120000 },
        )
        const t = typeof data?.text === 'string' ? data.text : ''
        if (t.trim()) return t
      } catch (e) {
        this.logger.warn(`Paddle OCR 不可用，降级本机 OCR 管线: ${(e as Error).message}`)
      }
    }

    return this.imageOcrPipeline.recognizeBuffer(buffer)
  }

  private async parseWord(filePath: string): Promise<string> {
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value
  }

  private async parseExcel(filePath: string): Promise<string> {
    const XLSX = require('xlsx')
    const workbook = XLSX.readFile(filePath)
    const sheets: string[] = []
    workbook.SheetNames.forEach((sheetName: string) => {
      const worksheet = workbook.Sheets[sheetName]
      const csv = XLSX.utils.sheet_to_csv(worksheet)
      sheets.push(`[Sheet: ${sheetName}]\n${csv}`)
    })
    return sheets.join('\n\n')
  }

  private detectFileType(mimeType: string, filename: string): FileType {
    const ext = path.extname(filename).toLowerCase()
    if (mimeType.includes('pdf') || ext === '.pdf') return FileType.PDF
    if (mimeType.includes('word') || ext === '.docx' || ext === '.doc') return FileType.WORD
    if (mimeType.includes('sheet') || ext === '.xlsx' || ext === '.xls') return FileType.EXCEL
    if (ext === '.yaml' || ext === '.yml') return FileType.YAML
    if (mimeType.startsWith('image/')) return FileType.IMAGE
    return FileType.TEXT
  }

  async getFileList(userId: string, page = 1, pageSize = 10) {
    const normalizedPage = Math.max(1, Number(page) || 1)
    const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 10))
    const [list, total] = await Promise.all([
      this.prisma.uploadedFile.findMany({
        where: { uploaderId: userId },
        skip: (normalizedPage - 1) * normalizedPageSize,
        take: normalizedPageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.uploadedFile.count({ where: { uploaderId: userId } }),
    ])
    return { list, total, page: normalizedPage, pageSize: normalizedPageSize }
  }

  async getFileByIdInternal(id: string) {
    const file = await this.prisma.uploadedFile.findUnique({ where: { id } })
    if (!file) throw new NotFoundException('文件不存在')

    // 若进程重启导致异步解析丢失，文件可能长期停留在 PARSING；
    // 用户查询单条时顺带触发一次轻量恢复，避免前端无限轮询。
    if (file.status === FileStatus.PARSING) {
      const min = this.parseTimeoutMinutes()
      const deadline = Date.now() - min * 60_000
      const staleAt = this.staleParsingDate(file.lastHeartbeatAt, file.updatedAt)
      if (staleAt && staleAt.getTime() < deadline) {
        const attempts = Math.max(0, Number(file.parseAttempts || 0))
        const canRetry = this.canRetrySourcePath(file.path)
        const maxAttempts = this.parseRecoverMaxAttempts()
        try {
          if (canRetry && attempts < maxAttempts) {
            const updated = await this.prisma.uploadedFile.update({
              where: { id },
              data: {
                status: FileStatus.PENDING,
                parseStage: 'PENDING',
                parseError: null,
                parseStartedAt: null,
                parseFinishedAt: null,
                parseProgress: Prisma.DbNull,
                lastHeartbeatAt: new Date(),
              },
            })
            this.enqueueParseWorkerFill()
            return updated
          }
          const msg = canRetry
            ? `【解析失败】解析任务已自动恢复 ${attempts} 次仍未完成，请点击「重试解析」。`
            : `【解析失败】解析超时（超过 ${min} 分钟未完成），且源文件已不存在，请重新上传。`
          const updated = await this.prisma.uploadedFile.update({
            where: { id },
            data: {
              status: FileStatus.FAILED,
              parseStage: 'FAILED',
              parseError: msg,
              parseFinishedAt: new Date(),
              parseProgress: Prisma.DbNull,
              lastHeartbeatAt: new Date(),
            },
          })
          return updated
        } catch (e) {
          // 若并发下被删除或已更新，返回原值即可
        }
      }
    }

    if (file.status === FileStatus.PENDING || file.status === FileStatus.PARSING) {
      return this.fileParseRuntime.mergeRealtime(file.id, file)
    }
    return file
  }

  async getFileById(id: string, userId: string) {
    const file = await this.prisma.uploadedFile.findFirst({ where: { id, uploaderId: userId } })
    if (!file) throw new NotFoundException('文件不存在')
    return this.getFileByIdInternal(file.id)
  }

  async deleteFile(id: string, userId: string) {
    const file = await this.getFileById(id, userId)

    if (file.path) {
      if (CosStorageService.isCosUri(file.path)) {
        if (this.cosStorage.isConfigured()) {
          try {
            await this.cosStorage.deleteObject(file.path)
          } catch (e) {
            this.logger.warn(`删除 COS 对象失败 ${file.path}`, e as Error)
          }
        }
      } else if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path)
      }
    }

    await this.prisma.uploadedFile.delete({ where: { id } })
    await this.fileParseRuntime.clearProgress(id)
  }

  /** 取消正在解析的任务 */
  async cancelTask(id: string, userId: string) {
    const file = await this.getFileById(id, userId)

    // 只能取消 PENDING 或 PARSING 状态的文件
    if (file.status !== FileStatus.PENDING && file.status !== FileStatus.PARSING) {
      throw new BadRequestException('该文件不在可取消的状态')
    }

    // 清理分片临时目录（如果存在）
    const chunkDir = this.chunkSessionDir(userId, id)
    if (fs.existsSync(chunkDir)) {
      try {
        fs.rmSync(chunkDir, { recursive: true, force: true })
      } catch (e) {
        this.logger.warn(`取消任务时清理分片目录失败: ${chunkDir}`, e as Error)
      }
    }

    const updated = await this.prisma.uploadedFile.update({
      where: { id },
      data: {
        status: FileStatus.FAILED,
        parseStage: 'CANCELLED',
        parseError: '用户取消',
        parseFinishedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
    })
    await this.fileParseRuntime.clearProgress(id)
    this.logger.log(`任务已取消: ${id}`)
    return updated
  }

  /** 重新排队解析（上传页「重试」）；可选仅内置文本层 */
  async retryParse(id: string, userId: string, opts?: { textOnly?: boolean }) {
    const file = await this.getFileById(id, userId)
    const canRetry =
      !!file.path &&
      (CosStorageService.isCosUri(file.path) || fs.existsSync(file.path))
    if (!canRetry) {
      throw new BadRequestException('源文件已按存储策略删除或不存在，无法重新解析，请重新上传')
    }

    await this.prisma.uploadedFile.update({
      where: { id },
      data: {
        status: FileStatus.PENDING,
        parseStage: 'PENDING',
        parseError: null,
        parsedContent: null,
        structuredRequirements: Prisma.DbNull,
        parseProgress: Prisma.DbNull,
        parseRetryHint: opts?.textOnly ? 'text_only' : null,
      },
    })

    return this.getFileById(id, userId)
  }

  /** SSE：订阅解析进度（每秒轮询 DB，终端状态或客户端断开时结束） */
  async streamParseEvents(
    id: string,
    userId: string,
    res: import('express').Response,
    req?: import('express').Request,
  ): Promise<void> {
    await this.getFileById(id, userId)

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    let iv: ReturnType<typeof setInterval> | undefined
    const cleanup = () => {
      if (iv) clearInterval(iv)
      iv = undefined
      try {
        if (!res.writableEnded) res.end()
      } catch {
        /* ignore */
      }
    }

    req?.on('close', cleanup)

    const tick = async () => {
      try {
        const f = await this.getFileById(id, userId)
        const payload = {
          status: f.status,
          parseStage: f.parseStage,
          parseProgress: (f as { parseProgress?: unknown }).parseProgress ?? null,
          parseError: f.parseError,
        }
        res.write(`data: ${JSON.stringify(payload)}\n\n`)
        if (f.status !== FileStatus.PENDING && f.status !== FileStatus.PARSING) {
          cleanup()
        }
      } catch {
        cleanup()
      }
    }

    void tick()
    iv = setInterval(() => void tick(), 1000)
  }

  /**
   * 用户在前端编辑「原始文本」后，重新脱敏 + 结构化（不重新跑 OCR/视觉）
   */
  async restructureFromEditedText(id: string, userId: string, text: string) {
    await this.getFileById(id, userId)

    const masked = maskSensitivePlainText(text)
    const { requirements: structured, cleanedText } =
      await this.requirementStructure.structureRequirements(masked)
    const parsedBody =
      cleanedText && cleanedText.trim().length > 0 ? cleanedText.trim() : masked
    const enriched = this.enrichParsedContentWithFlowchart(parsedBody, structured)

    await this.prisma.uploadedFile.update({
      where: { id },
      data: {
        parsedContent: enriched.parsedContent,
        structuredRequirements: enriched.structuredRequirements as Prisma.InputJsonValue,
        status: FileStatus.PARSED,
        parseError: null,
      },
    })

    return this.getFileById(id, userId)
  }

  private maxUploadBytes(): number {
    const n = parseInt(this.config.get<string>('MAX_FILE_SIZE') || '104857600', 10)
    return Number.isFinite(n) && n > 0 ? n : 104857600
  }

  private chunkSessionDir(uploaderId: string, fileId: string): string {
    return path.join(this.uploadDir, 'chunks', uploaderId, fileId)
  }

  /** 分片上传：写入临时目录，合并阶段再落盘为正式文件 */
  async saveUploadedChunk(
    uploaderId: string,
    fileId: string,
    chunkIndex: number,
    chunkTotal: number,
    chunkSize: number,
    buffer: Buffer,
  ): Promise<{ uploaded: boolean }> {
    if (chunkTotal < 1 || chunkTotal > 256) {
      throw new BadRequestException('无效的分片数量')
    }
    if (chunkIndex < 0 || chunkIndex >= chunkTotal) {
      throw new BadRequestException('无效的分片序号')
    }
    if (chunkIndex < chunkTotal - 1) {
      if (buffer.length !== chunkSize) {
        throw new BadRequestException('非末分片大小须等于 chunkSize')
      }
    } else if (buffer.length < 1 || buffer.length > chunkSize) {
      throw new BadRequestException('末分片大小无效')
    }

    const maxBytes = this.maxUploadBytes()
    const upperBound = chunkTotal * chunkSize
    if (upperBound > maxBytes) {
      throw new BadRequestException(`分片总规模超过单文件限制（${Math.round(maxBytes / 1024 / 1024)} MB）`)
    }

    const dir = this.chunkSessionDir(uploaderId, fileId)
    fs.mkdirSync(dir, { recursive: true })
    const metaPath = path.join(dir, '.meta.json')
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
        chunkTotal: number
        chunkSize: number
      }
      if (meta.chunkTotal !== chunkTotal || meta.chunkSize !== chunkSize) {
        throw new BadRequestException('分片元信息与首次上传不一致')
      }
    } else {
      fs.writeFileSync(metaPath, JSON.stringify({ chunkTotal, chunkSize }))
    }

    fs.writeFileSync(path.join(dir, `part-${chunkIndex}`), buffer)
    return { uploaded: true }
  }

  /** 合并分片为正式上传文件并进入解析队列 */
  async mergeChunkedUpload(uploaderId: string, dto: MergeChunksDto) {
    const dir = this.chunkSessionDir(uploaderId, dto.fileId)
    const metaPath = path.join(dir, '.meta.json')
    if (!fs.existsSync(metaPath)) {
      throw new BadRequestException('分片会话不存在或已合并')
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
      chunkTotal: number
      chunkSize: number
    }
    if (meta.chunkTotal !== dto.chunkTotal) {
      throw new BadRequestException('chunkTotal 与会话不一致')
    }

    const maxBytes = this.maxUploadBytes()
    const mergedTmpPath = path.join(dir, `.merged-${uuid()}.tmp`)
    let mergedBytes = 0
    const limitErrorText = `合并后超过单文件限制（${Math.round(maxBytes / 1024 / 1024)} MB）`

    try {
      for (let i = 0; i < dto.chunkTotal; i++) {
        const partPath = path.join(dir, `part-${i}`)
        if (!fs.existsSync(partPath)) {
          throw new BadRequestException(`缺少分片 ${i + 1}/${dto.chunkTotal}`)
        }
        await pipeline(
          fs.createReadStream(partPath),
          new Transform({
            transform: (chunk, _encoding, callback) => {
              const piece = chunk as Buffer
              mergedBytes += piece.length
              if (mergedBytes > maxBytes) {
                callback(new BadRequestException(limitErrorText))
                return
              }
              callback(null, piece)
            },
          }),
          fs.createWriteStream(mergedTmpPath, { flags: 'a' }),
        )
      }

      if (mergedBytes < 1) {
        throw new BadRequestException('合并后文件为空')
      }

      return await this.saveUploadedFileFromPath(
        mergedTmpPath,
        dto.originalName,
        dto.mimeType,
        uploaderId,
      )
    } finally {
      try {
        if (fs.existsSync(mergedTmpPath)) fs.unlinkSync(mergedTmpPath)
      } catch (e) {
        this.logger.warn(`清理临时合并文件失败: ${mergedTmpPath}`, e as Error)
      }
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch (e) {
        this.logger.warn(`清理分片目录失败: ${dir}`, e as Error)
      }
    }
  }
}

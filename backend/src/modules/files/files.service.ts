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
import { CosStorageService } from './cos-storage.service'
import { ImageOcrPipelineService } from '@/modules/ocr/image-ocr-pipeline.service'
import { ImagePreprocessService } from '@/modules/ocr/image-preprocess.service'
import { TencentOcrClientService } from '@/modules/ocr/tencent-ocr.client.service'
import { PdfDocumentParseService } from './pdf-document-parse.service'
import { MultimodalService } from '@/modules/multimodal/multimodal.service'
import { sanitizeErrorMessageForClient } from '@/utils/sanitizeErrorMessage'

@Injectable()
export class FilesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FilesService.name)
  private readonly uploadDir: string
  private parseWorkerTimer?: NodeJS.Timeout
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
  ) {
    this.uploadDir = this.config.get<string>('UPLOAD_DIR', './uploads')
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true })
    }
    this.logger.log('FilesService initialized')
  }

  onModuleInit() {
    // 后台解析 worker：扫描 PENDING 文件并解析（避免进程重启导致 parseFileAsync 丢失）
    const enabled = this.config.get<string>('FILE_PARSE_WORKER_ENABLED') !== '0'
    if (!enabled) {
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
    if (!claimed.path?.trim()) return
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

  /** 保存上传记录并触发异步解析 */
  async saveUploadedFile(file: Express.Multer.File, uploaderId: string) {
    const fileType = this.detectFileType(file.mimetype, file.originalname)
    const safeName =
      (file.filename && String(file.filename).trim()) ||
      `${uuid()}${path.extname(file.originalname) || ''}`

    if (!this.cosStorage.isConfigured()) {
      throw new BadRequestException(
        '文件上传已切换为 COS 主链路，但当前服务未配置 COS。请先设置 COS_SECRET_ID、COS_SECRET_KEY、COS_BUCKET、COS_REGION 并重启后端。',
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
      throw new BadRequestException(`文件上传到 COS 失败：${(e as Error).message}`)
    }
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
    const fileType = this.detectFileType(mimeType, originalName)
    const safeName = `${uuid()}${path.extname(originalName) || ''}`

    if (!this.cosStorage.isConfigured()) {
      throw new BadRequestException(
        '分片合并后上传已切换为 COS 主链路，但当前服务未配置 COS。请先设置 COS_SECRET_ID、COS_SECRET_KEY、COS_BUCKET、COS_REGION 并重启后端。',
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
      throw new BadRequestException(`文件上传到 COS 失败：${(e as Error).message}`)
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

    const heartbeat = async (stage: string, progress?: Record<string, unknown>) => {
      try {
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

      const trimmed = content.trim()
      if (!trimmed || trimmed.startsWith('【解析失败】')) {
        throw new Error(trimmed || '内容为空，无法完成解析')
      }

      await heartbeat('STRUCTURE', { phase: 'STRUCTURE' })
      const masked = maskSensitivePlainText(content)
      const { requirements: structured, cleanedText } =
        await this.requirementStructure.structureRequirements(masked)
      const parsedBody =
        cleanedText && cleanedText.trim().length > 0 ? cleanedText.trim() : masked

      await this.prisma.uploadedFile.update({
        where: { id: fileId },
        data: {
          parsedContent: parsedBody,
          structuredRequirements: structured as Prisma.InputJsonValue,
          status: FileStatus.PARSED,
          parseError: null,
          parseStage: 'DONE',
          parseFinishedAt: new Date(),
          lastHeartbeatAt: new Date(),
          parseProgress: Prisma.DbNull,
          parseRetryHint: null,
        },
      })
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

  /** 将底层 OCR 异常映射为前端可展示的简短原因 */
  private classifyOcrFailureMessage(err: unknown): string {
    const m = (err as Error)?.message ?? ''
    if (/timeout|超过|ETIMEDOUT/i.test(m)) return '网络或处理超时'
    if (/sharp|预处理/i.test(m)) return '图片预处理失败'
    if (/empty|结果为空/i.test(m)) return '未识别到文字，可能图片模糊或对比度过低'
    return '识别失败'
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
    const res = await this.multimodal.tryDirectCosMultimodal({
      moduleType: 'FILE_PARSE',
      fileKind: 'PDF',
      userId: ctx.uploaderId ?? 'system',
      uploadedFileId: ctx.fileId,
      storedPath: ctx.originalStoredPath,
      localPath: filePath,
      fileBytes: ctx.fileBytes,
    })
    if (res?.text?.trim()) {
      const body = res.text
      const minChars = parseInt(
        this.config.get<string>('HUNYUAN_COS_MULTIMODAL_MIN_OUTPUT_CHARS_PDF') || '40',
        10,
      )
      const floor = Number.isFinite(minChars) && minChars > 0 ? minChars : 40
      if (body.trim().length >= floor) {
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
      this.logger.warn(`混元 COS PDF 多模态正文过短（${body.trim().length} < ${floor}），继续后续流程`)
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

  /**
   * PDF 分页渲染 + 视觉分批（依赖 pdf-to-img/canvas）开关。
   * 为避免某些服务器环境下 native 依赖异常导致进程崩溃，默认关闭，需显式设 1 开启。
   */
  private fileParsePdfPagedVisionEnabled(): boolean {
    return this.config.get<string>('FILE_PARSE_PDF_PAGED_VISION')?.trim() === '1'
  }

  /**
   * 混元直读未命中后：在允许腾讯云兜底时走全本 OCR；否则抛错。
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
    },
    embeddedText: string,
    numpages: number,
  ): Promise<string> {
    throw new Error(
      '【解析失败】PDF 解析仅允许混元主链路：混元未返回足够长的有效正文。请核对 HUNYUAN_VISION_API_KEY（或 HUNYUAN_OPENAI_API_KEY）、HUNYUAN_MULTIMODAL_ENABLED/HUNYUAN_COS_MULTIMODAL_PARSE_ENABLED、HUNYUAN_COS_MULTIMODAL_MIN_OUTPUT_CHARS_PDF，并确认文件已上传至 COS。',
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
    },
  ): Promise<string> {
    const sizeMb = ctx.fileBytes / (1024 * 1024)
    await heartbeat('PDF', {
      phase: 'PDF',
      fileBytes: ctx.fileBytes,
      message: 'hunyuan_primary',
      ...(sizeMb > 5
        ? { etaMinutes: Math.max(1, Math.ceil(sizeMb * 0.6)), largePdf: true }
        : {}),
    })

    if (this.fileParsePdfPagedVisionEnabled()) {
      const visionPaged = await this.documentVision.transcribePdfByVisionBatches(
        filePath,
        async (p) => {
          await heartbeat('HUNYUAN_COS_MULTIMODAL', {
            phase: 'VISION',
            message: 'hunyuan_pdf_page_batch',
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
          message: 'hunyuan_pdf_page_batch_done',
          chars: visionPaged.text.length,
        })
        this.logger.log(
          `PDF：已通过分页渲染 + 混元视觉完成主解析（model=${visionPaged.modelName}, chars=${visionPaged.text.length})`,
        )
        return visionPaged.text
      }
      this.logger.warn('PDF：分页视觉链路未返回有效正文，尝试混元 PDF 直读 COS 兼容链路')
    }

    const hunyuanBody = await this.tryPdfHunyuanCosMultimodalBody(filePath, heartbeat, ctx, '')
    if (hunyuanBody) return hunyuanBody

    return this.finishPdfAfterHunyuanMiss(filePath, heartbeat, ctx, '', 0)
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
      while (true) {
        const idx = nextIndex++
        if (idx >= items.length) break
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
      for await (const page of this.documentVision.iteratePdfPagesAsPng(filePath)) {
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

    // 若进程重启导致异步解析丢失，文件可能长期停留在 PARSING；这里做兜底超时标记，避免前端无限轮询。
    if (file.status === FileStatus.PARSING) {
      const timeoutMin = parseInt(this.config.get<string>('FILE_PARSE_TIMEOUT_MINUTES') || '15', 10)
      const min = Number.isFinite(timeoutMin) && timeoutMin > 0 ? timeoutMin : 15
      const deadline = Date.now() - min * 60_000
      if (file.updatedAt && file.updatedAt.getTime() < deadline) {
        const msg = `【解析失败】解析超时（超过 ${min} 分钟未完成）。可能是服务重启导致解析任务丢失，可点击「重试解析」。`
        try {
          const updated = await this.prisma.uploadedFile.update({
            where: { id },
            data: { status: FileStatus.FAILED, parseError: msg },
          })
          return updated
        } catch (e) {
          // 若并发下被删除或已更新，返回原值即可
        }
      }
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

    await this.prisma.uploadedFile.update({
      where: { id },
      data: {
        parsedContent: parsedBody,
        structuredRequirements: structured as Prisma.InputJsonValue,
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

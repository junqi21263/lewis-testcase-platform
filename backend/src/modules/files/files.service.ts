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
import { FileStatus, FileType, Prisma } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { PrismaService } from '@/prisma/prisma.service'
import { DocumentVisionService } from './document-vision.service'
import { RequirementStructureService } from './requirement-structure.service'
import { maskSensitivePlainText } from '@/common/utils/sensitive-mask'
import { v4 as uuid } from 'uuid'
import axios from 'axios'
import type { MergeChunksDto } from './dto/merge-chunks.dto'

@Injectable()
export class FilesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FilesService.name)
  private readonly uploadDir: string
  private parseWorkerTimer?: NodeJS.Timeout
  private parseWorkerRunning = false

  private isNotFoundUpdateError(err: unknown) {
    return err instanceof PrismaClientKnownRequestError && err.code === 'P2025'
  }

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private documentVision: DocumentVisionService,
    private requirementStructure: RequirementStructureService,
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
    const intervalMs = parseInt(this.config.get<string>('FILE_PARSE_WORKER_INTERVAL_MS') || '1500', 10)
    const ms = Number.isFinite(intervalMs) && intervalMs > 300 ? intervalMs : 1500
    this.parseWorkerTimer = setInterval(() => void this.tickParseWorker(), ms)
    this.logger.log(`后台解析 worker 已启动（interval=${ms}ms）`)
    // 启动后立即跑一次（避免新上传文件等待 1 个 interval）
    void this.tickParseWorker()
  }

  onModuleDestroy() {
    if (this.parseWorkerTimer) clearInterval(this.parseWorkerTimer)
  }

  private async tickParseWorker() {
    if (this.parseWorkerRunning) return
    this.parseWorkerRunning = true
    try {
      this.logger.debug('后台解析 worker tick...')
      const claimed = await this.claimNextPendingFile()
      if (!claimed) {
        this.logger.debug('后台解析 worker: 无待处理 PENDING 文件')
        return
      }
      this.logger.log(`后台解析 worker: 已认领文件 ${claimed.id} (${claimed.fileType})`)
      await this.parseFileAsync(claimed.id, claimed.path, claimed.fileType, claimed.mimeType)
    } catch (e) {
      this.logger.error('后台解析 worker tick 失败', e as Error)
    } finally {
      this.parseWorkerRunning = false
    }
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
    if (!next.path) return null
    return { ...next, path: next.path }
  }

  /** 保存上传记录并触发异步解析 */
  async saveUploadedFile(file: Express.Multer.File, uploaderId: string) {
    const fileType = this.detectFileType(file.mimetype, file.originalname)

    // 以落盘文件为准（部分平台/代理可能导致 file.size 与实际不一致）
    let diskSize = file.size
    try {
      if (file.path && fs.existsSync(file.path)) {
        diskSize = fs.statSync(file.path).size
      }
    } catch (e) {
      this.logger.warn(`读取上传文件大小失败: ${file.path}`, e as Error)
    }

    const record = await this.prisma.uploadedFile.create({
      data: {
        name: file.filename,
        originalName: file.originalname,
        path: file.path,
        size: diskSize,
        mimeType: file.mimetype,
        fileType,
        status: FileStatus.PENDING,
        parseStage: 'PENDING',
        uploaderId,
      },
    })

    if (!file.path || !fs.existsSync(file.path) || diskSize < 1) {
      const msg = !file.path
        ? '【解析失败】上传文件路径为空（服务端未落盘）。请重试上传。'
        : !fs.existsSync(file.path)
          ? `【解析失败】上传文件未落盘或已丢失：${file.path}。请重试上传。`
          : `【解析失败】上传文件为空（0 bytes）：${file.path}。请重试上传。`
      await this.prisma.uploadedFile.update({
        where: { id: record.id },
        data: { status: FileStatus.FAILED, parseError: msg, parseStage: 'UPLOAD_CHECK' },
      })
      return this.getFileById(record.id)
    }

    return record
  }

  /** 异步解析文件内容（图片/PDF 优先多模态视觉理解，再 OCR/文本提取） */
  private async parseFileAsync(
    fileId: string,
    filePath: string,
    fileType: FileType,
    mimeType: string,
  ) {
    const hintRow = await this.prisma.uploadedFile.findUnique({
      where: { id: fileId },
      select: { parseRetryHint: true },
    })
    const parseRetryHint = hintRow?.parseRetryHint ?? null

    try {
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

    try {
      let content = ''

      // 再次确认文件存在且非空（避免零字节文件进入 pdf-to-img 等链路）
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error(`【解析失败】本地文件不存在：${filePath || '(empty path)'}。请重新上传。`)
      }
      const st = fs.statSync(filePath)
      if (st.size < 1) {
        throw new Error(`【解析失败】本地文件为空（0 bytes）：${filePath}。请重新上传。`)
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
          content = await this.parsePdfWithVisionFallback(filePath, heartbeat, {
            fileId,
            fileBytes: st.size,
            parseRetryHint,
          })
          break
        }
        case FileType.WORD:
          await heartbeat('WORD')
          content = await this.parseWord(filePath)
          break
        case FileType.EXCEL:
          await heartbeat('EXCEL')
          content = await this.parseExcel(filePath)
          break
        case FileType.YAML:
          await heartbeat('YAML')
          content = fs.readFileSync(filePath, 'utf-8')
          break
        case FileType.TEXT:
          await heartbeat('TEXT')
          content = fs.readFileSync(filePath, 'utf-8')
          break
        case FileType.IMAGE:
          await heartbeat('IMAGE')
          content = await this.parseImageVisionThenOcr(filePath, mimeType)
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
      const msg = ((err as Error).message || '解析失败').slice(0, 4000)
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
    }
    } finally {
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

  /** 图片：视觉模型理解 + Tesseract OCR 辅助 */
  private async parseImageVisionThenOcr(filePath: string, mimeType: string): Promise<string> {
    const vision = await this.documentVision.transcribeImageFileAuto(filePath, mimeType)
    let ocr = ''
    try {
      ocr = await this.parseImageOCR(filePath)
    } catch (e) {
      this.logger.warn(`OCR 失败: ${(e as Error).message}`)
    }

    if (vision?.text) {
      let body = `【多模态视觉理解｜${vision.modelName}】\n${vision.text.trim()}`
      if (ocr.trim() && ocr.trim() !== vision.text.trim()) {
        body += `\n\n【OCR 辅助（Tesseract）】\n${ocr.trim()}`
      }
      return body
    }

    if (ocr.trim()) {
      return `【OCR｜Tesseract】\n${ocr.trim()}`
    }

    return (
      '【解析失败】未配置可用的视觉解析模型，且 OCR 无结果。请在「系统设置」中为支持 image 的模型勾选「支持视觉」并指定「文档视觉解析」模型，或设置环境变量 VISION_PARSE_MODEL_CONFIG_ID。'
    )
  }

  /**
   * PDF：第一层 pdf-parse 文本层；足够则直接返回。
   * 否则分页 OCR（视觉 / Paddle / Tesseract）；支持增量快照与 parseProgress 回写。
   */
  private async parsePdfWithVisionFallback(
    filePath: string,
    heartbeat: (stage: string, progress?: Record<string, unknown>) => Promise<void>,
    ctx: { fileId: string; fileBytes: number; parseRetryHint: string | null },
  ): Promise<string> {
    if (ctx.parseRetryHint === 'text_only') {
      await heartbeat('PDF_TEXT_LAYER', { phase: 'TEXT_LAYER', textOnly: true })
      const { text, numpages } = await this.parsePdfWithMeta(filePath)
      if (!text.trim()) {
        throw new Error(
          '【解析失败】「仅内置文本」模式下未读取到文本层，可能为扫描版 PDF。请重新解析并取消「仅内置文本」，以启用完整 OCR。',
        )
      }
      await heartbeat('PDF_TEXT_LAYER_OK', {
        phase: 'TEXT_LAYER',
        pageTotal: numpages,
        message: 'text_only_ok',
      })
      return `【PDF 文本提取｜仅内置文本】\n${text.trim()}`
    }

    const sizeMb = ctx.fileBytes / (1024 * 1024)
    await heartbeat('PDF_TEXT_LAYER', {
      phase: 'TEXT_LAYER',
      fileBytes: ctx.fileBytes,
      ...(sizeMb > 5
        ? { etaMinutes: Math.max(1, Math.ceil(sizeMb * 0.6)), message: 'large_pdf_eta' }
        : {}),
    })

    let text = ''
    let numpages = 0
    try {
      const meta = await this.parsePdfWithMeta(filePath)
      text = meta.text
      numpages = meta.numpages
    } catch (e) {
      this.logger.warn(`pdf-parse 失败: ${(e as Error).message}`)
    }

    await heartbeat('PDF_TEXT_LAYER', {
      phase: 'TEXT_LAYER',
      extractedChars: text.trim().length,
      pageTotal: numpages,
    })

    const minLen = parseInt(this.config.get<string>('VISION_PDF_MIN_TEXT_CHARS') || '120', 10)
    const garbledMaxRaw = this.config.get<string>('PDF_TEXT_GARBLED_RATIO_MAX')
    const garbledMax = parseFloat(garbledMaxRaw || '0.3')
    const garbledRatio = this.estimateGarbledRatio(text)
    const forceVision = this.config.get<string>('VISION_PDF_ALWAYS') === '1'

    const gm = Number.isFinite(garbledMax) && garbledMax > 0 && garbledMax <= 1 ? garbledMax : 0.3
    const textSufficient = text.trim().length >= minLen && garbledRatio <= gm

    if (textSufficient && !forceVision) {
      await heartbeat('PDF_TEXT_LAYER_OK', {
        phase: 'TEXT_LAYER',
        pageTotal: numpages,
        message: 'skip_ocr',
      })
      this.logger.log(
        `PDF 文本层可用（${text.trim().length} 字，乱码占比 ${(garbledRatio * 100).toFixed(1)}%），跳过多模态/OCR`,
      )
      return `【PDF 文本提取】\n${text.trim()}`
    }

    if (textSufficient && forceVision) {
      await heartbeat('PDF_TEXT_LAYER_OK', { phase: 'TEXT_LAYER', pageTotal: numpages })
      this.logger.log(
        `PDF 文本层已充足；忽略 VISION_PDF_ALWAYS，避免对大文件发起多余视觉调用（${text.trim().length} 字）`,
      )
      return `【PDF 文本提取】\n${text.trim()}`
    }

    this.logger.warn(
      `PDF 文本层不足或质量偏低（字数 ${text.trim().length}，乱码占比 ${(garbledRatio * 100).toFixed(1)}%），启用分页 OCR 管线`,
    )
    return this.parsePdfOcrBatchedPipeline(filePath, text, heartbeat, ctx.fileId, numpages)
  }

  /** 乱码/替换符占比，用于判断是否需要 OCR */
  private estimateGarbledRatio(raw: string): number {
    if (!raw || raw.length === 0) return 1
    let bad = 0
    for (let i = 0; i < raw.length; i++) {
      const c = raw.charCodeAt(i)
      if (c === 0xfffd) bad++
      else if (c < 32 && c !== 9 && c !== 10 && c !== 13) bad++
    }
    return bad / raw.length
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
   * PNG Buffer：可选 Paddle OCR HTTP 服务 → Tesseract
   * 期望 Paddle 服务 POST JSON `{ image_base64 }` 返回 `{ text }`
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
        this.logger.warn(`Paddle OCR 不可用，降级 Tesseract: ${(e as Error).message}`)
      }
    }

    const Tesseract = require('tesseract.js')
    const langs =
      (this.config.get<string>('OCR_LANGS') || 'chi_sim+chi_tra+eng').trim() ||
      'chi_sim+chi_tra+eng'
    const {
      data: { text },
    } = await Tesseract.recognize(buffer, langs)
    return text || ''
  }

  private async parsePdfWithMeta(filePath: string): Promise<{ text: string; numpages: number }> {
    const pdfParse = require('pdf-parse')
    const buffer = fs.readFileSync(filePath)
    const data = await pdfParse(buffer)
    const numpages =
      typeof data.numpages === 'number'
        ? data.numpages
        : typeof (data as { numPages?: number }).numPages === 'number'
          ? (data as { numPages: number }).numPages
          : 0
    return { text: data.text || '', numpages }
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

  private async parseImageOCR(filePath: string): Promise<string> {
    const Tesseract = require('tesseract.js')
    // 繁体图片仅用 chi_sim 容易乱码；默认同时启用 chi_sim + chi_tra + eng
    // 可在部署环境通过 OCR_LANGS 覆盖，例如：OCR_LANGS=chi_tra+eng
    const langs =
      (this.config.get<string>('OCR_LANGS') || 'chi_sim+chi_tra+eng').trim() ||
      'chi_sim+chi_tra+eng'
    const {
      data: { text },
    } = await Tesseract.recognize(filePath, langs)
    return text
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
    const [list, total] = await Promise.all([
      this.prisma.uploadedFile.findMany({
        where: { uploaderId: userId },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.uploadedFile.count({ where: { uploaderId: userId } }),
    ])
    return { list, total, page, pageSize }
  }

  async getFileById(id: string) {
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

  async deleteFile(id: string, userId: string) {
    const file = await this.getFileById(id)
    if (file.uploaderId !== userId) throw new BadRequestException('无权删除该文件')

    if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)

    await this.prisma.uploadedFile.delete({ where: { id } })
  }

  /** 取消正在解析的任务 */
  async cancelTask(id: string, userId: string) {
    const file = await this.getFileById(id)
    if (file.uploaderId !== userId) throw new BadRequestException('无权操作该文件')

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
    const file = await this.getFileById(id)
    if (file.uploaderId !== userId) throw new BadRequestException('无权操作该文件')
    if (!file.path || !fs.existsSync(file.path)) {
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

    return this.getFileById(id)
  }

  /** SSE：订阅解析进度（每秒轮询 DB，终端状态或客户端断开时结束） */
  async streamParseEvents(
    id: string,
    userId: string,
    res: import('express').Response,
    req?: import('express').Request,
  ): Promise<void> {
    const file = await this.getFileById(id)
    if (file.uploaderId !== userId) {
      res.status(403).end()
      return
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
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
        const f = await this.getFileById(id)
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
    const file = await this.getFileById(id)
    if (file.uploaderId !== userId) throw new BadRequestException('无权操作该文件')

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

    return this.getFileById(id)
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

    const buffers: Buffer[] = []
    for (let i = 0; i < dto.chunkTotal; i++) {
      const p = path.join(dir, `part-${i}`)
      if (!fs.existsSync(p)) {
        throw new BadRequestException(`缺少分片 ${i + 1}/${dto.chunkTotal}`)
      }
      buffers.push(fs.readFileSync(p))
    }

    const final = Buffer.concat(buffers)
    const maxBytes = this.maxUploadBytes()
    if (final.length > maxBytes) {
      throw new BadRequestException(`合并后超过单文件限制（${Math.round(maxBytes / 1024 / 1024)} MB）`)
    }
    if (final.length < 1) {
      throw new BadRequestException('合并后文件为空')
    }

    const ext = path.extname(dto.originalName) || '.bin'
    const filename = `${uuid()}${ext}`
    const destPath = path.join(this.uploadDir, filename)
    fs.writeFileSync(destPath, final)

    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (e) {
      this.logger.warn(`清理分片目录失败: ${dir}`, e as Error)
    }

    const multerLike = {
      path: destPath,
      filename,
      originalname: dto.originalName,
      mimetype: dto.mimeType,
      size: final.length,
    } as Express.Multer.File

    return this.saveUploadedFile(multerLike, uploaderId)
  }
}

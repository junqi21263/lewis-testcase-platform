import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import * as path from 'path'
import { pipeline } from 'stream/promises'
import { FileStatus, FileType, FileStorageProvider } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { CosService } from './cos.service'

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name)
  private readonly uploadDir: string
  private readonly chunkRootDir: string

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private cos: CosService,
  ) {
    this.uploadDir = this.config.get<string>('UPLOAD_DIR', './uploads')
    this.chunkRootDir = path.join(this.uploadDir, '.chunks')
    // 确保上传目录存在
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true })
    }
    if (!fs.existsSync(this.chunkRootDir)) {
      fs.mkdirSync(this.chunkRootDir, { recursive: true })
    }
  }

  /** 保存上传记录并触发异步解析 */
  async saveUploadedFile(file: Express.Multer.File, uploaderId: string) {
    const fileType = this.detectFileType(file.mimetype, file.originalname)

    const record = await this.prisma.uploadedFile.create({
      data: {
        name: file.filename,
        originalName: file.originalname,
        path: file.path,
        size: file.size,
        mimeType: file.mimetype,
        fileType,
        status: FileStatus.PENDING,
        uploaderId,
        storageProvider: FileStorageProvider.LOCAL,
      },
    })

    // 异步解析文件内容
    this.parseFileAsync(record.id, file.path, fileType).catch((err) =>
      this.logger.error(`文件解析失败: ${record.id}`, err),
    )

    // 异步上传到 COS（启用时）
    this.uploadToCosAsync(record.id).catch((err) =>
      this.logger.warn(`上传 COS 失败: ${record.id} ${(err as Error)?.message || err}`),
    )

    return record
  }

  private async uploadToCosAsync(fileId: string) {
    if (!this.cos.isEnabled()) return
    const file = await this.prisma.uploadedFile.findUnique({ where: { id: fileId } })
    if (!file) return
    if (!file.path) return
    if (file.storageProvider === FileStorageProvider.COS && file.storageKey) return
    if (!fs.existsSync(file.path)) return

    const key = this.cos.buildObjectKey(file.id, file.originalName)
    const { bucket, region } = await this.cos.uploadLocalFile(file.path, key)
    const signedUrl = this.cos.getSignedUrl(key, 3600)

    await this.prisma.uploadedFile.update({
      where: { id: fileId },
      data: {
        storageProvider: FileStorageProvider.COS,
        storageBucket: bucket,
        storageRegion: region,
        storageKey: key,
        storageUrl: signedUrl,
      },
    })
  }

  /**
   * 保存单个分片到磁盘
   * chunk 会被存储到 `${UPLOAD_DIR}/.chunks/{fileId}/{chunkIndex}.part`
   */
  async saveUploadChunk(
    chunkFile: Express.Multer.File,
    info: { fileId: string; chunkIndex: number; chunkTotal: number },
  ) {
    const { fileId, chunkIndex, chunkTotal } = info
    if (!fileId) throw new BadRequestException('fileId 不能为空')
    if (!Number.isFinite(chunkIndex) || chunkIndex < 0) throw new BadRequestException('chunkIndex 不合法')
    if (!Number.isFinite(chunkTotal) || chunkTotal <= 0) throw new BadRequestException('chunkTotal 不合法')
    if (chunkIndex >= chunkTotal) throw new BadRequestException('chunkIndex 超出范围')

    const dir = path.join(this.chunkRootDir, fileId)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    const dest = path.join(dir, `${chunkIndex}.part`)
    // multer diskStorage 已经写盘；这里直接移动/覆盖即可
    fs.copyFileSync(chunkFile.path, dest)
    try {
      fs.unlinkSync(chunkFile.path)
    } catch {
      // ignore
    }

    return { uploaded: true }
  }

  /**
   * 合并分片为最终文件，然后走 saveUploadedFile 入库并触发解析
   */
  async mergeUploadChunks(
    uploaderId: string,
    payload: { fileId: string; originalName: string; mimeType: string; chunkTotal?: number },
  ) {
    const { fileId, originalName, mimeType } = payload
    if (!fileId) throw new BadRequestException('fileId 不能为空')
    if (!originalName) throw new BadRequestException('originalName 不能为空')
    if (!mimeType) throw new BadRequestException('mimeType 不能为空')

    const dir = path.join(this.chunkRootDir, fileId)
    if (!fs.existsSync(dir)) throw new NotFoundException('分片不存在或已过期')

    const partFiles = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.part'))
      .sort((a, b) => Number(a.replace('.part', '')) - Number(b.replace('.part', '')))

    const expectedTotal =
      typeof payload.chunkTotal === 'number' && payload.chunkTotal > 0 ? payload.chunkTotal : partFiles.length

    if (partFiles.length === 0) throw new BadRequestException('未找到任何分片')
    if (partFiles.length !== expectedTotal) {
      throw new BadRequestException(`分片数量不完整：已收到 ${partFiles.length}/${expectedTotal}`)
    }

    const indices = partFiles
      .map((f) => Number(f.replace('.part', '')))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)
    if (indices.length !== partFiles.length) {
      throw new BadRequestException('分片文件名不合法')
    }
    const minIdx = indices[0]
    const maxIdx = indices[indices.length - 1]
    const missing: number[] = []
    for (let i = 0; i < expectedTotal; i++) {
      if (!fs.existsSync(path.join(dir, `${i}.part`))) missing.push(i)
    }
    if (missing.length) {
      throw new BadRequestException(
        `分片缺失：缺少 ${missing.slice(0, 20).join(', ')}（已收到 ${indices.join(', ')}；范围 ${minIdx}-${maxIdx}）`,
      )
    }

    const ext = path.extname(originalName)
    const finalName = `${fileId}${ext || ''}`
    const finalPath = path.join(this.uploadDir, finalName)

    // 合并写入
    const ws = fs.createWriteStream(finalPath)
    try {
      for (let i = 0; i < expectedTotal; i++) {
        const p = path.join(dir, `${i}.part`)
        const rs = fs.createReadStream(p)
        await pipeline(rs, ws, { end: false } as any)
      }
    } finally {
      ws.end()
    }

    // 清理分片目录
    try {
      for (const f of partFiles) fs.unlinkSync(path.join(dir, f))
      fs.rmdirSync(dir)
    } catch {
      // ignore
    }

    const stat = fs.statSync(finalPath)
    const mergedFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: originalName,
      encoding: '7bit',
      mimetype: mimeType,
      destination: this.uploadDir,
      filename: finalName,
      path: finalPath,
      size: stat.size,
      buffer: undefined as any,
      stream: undefined as any,
    } as any

    return this.saveUploadedFile(mergedFile, uploaderId)
  }

  /** 异步解析文件内容 */
  private async parseFileAsync(fileId: string, filePath: string, fileType: FileType) {
    await this.prisma.uploadedFile.update({ where: { id: fileId }, data: { status: FileStatus.PARSING } })

    try {
      let content = ''

      switch (fileType) {
        case FileType.PDF:
          content = await this.parsePdf(filePath)
          break
        case FileType.WORD:
          content = await this.parseWord(filePath)
          break
        case FileType.EXCEL:
          content = await this.parseExcel(filePath)
          break
        case FileType.YAML:
          content = fs.readFileSync(filePath, 'utf-8')
          break
        case FileType.TEXT:
          content = fs.readFileSync(filePath, 'utf-8')
          break
        case FileType.IMAGE:
          content = await this.parseImageOCR(filePath)
          break
        default:
          content = '不支持的文件格式'
      }

      await this.prisma.uploadedFile.update({
        where: { id: fileId },
        data: { parsedContent: content, status: FileStatus.PARSED },
      })
      this.logger.log(`文件解析完成: ${fileId}`)
    } catch (err) {
      await this.prisma.uploadedFile.update({
        where: { id: fileId },
        data: { status: FileStatus.FAILED },
      })
      throw err
    }
  }

  private async parsePdf(filePath: string): Promise<string> {
    const pdfParse = require('pdf-parse')
    const buffer = fs.readFileSync(filePath)
    const data = await pdfParse(buffer)
    return data.text
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
    const { data: { text } } = await Tesseract.recognize(filePath, 'chi_sim+eng')
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
    return file
  }

  async deleteFile(id: string, userId: string) {
    const file = await this.getFileById(id)
    if (file.uploaderId !== userId) throw new BadRequestException('无权删除该文件')

    // 删除 COS 对象（如有）
    if (file.storageProvider === FileStorageProvider.COS && file.storageKey) {
      await this.cos.deleteObject(file.storageKey).catch((err) => {
        this.logger.warn(`删除 COS 对象失败: ${file.id} ${(err as Error)?.message || err}`)
      })
    }

    // 删除物理文件
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path)

    await this.prisma.uploadedFile.delete({ where: { id } })
  }
}

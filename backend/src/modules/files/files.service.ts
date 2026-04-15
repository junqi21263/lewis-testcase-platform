import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import * as path from 'path'
import { FileStatus, FileType, Prisma } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { DocumentVisionService } from './document-vision.service'
import { RequirementStructureService } from './requirement-structure.service'
import { maskSensitivePlainText } from '@/common/utils/sensitive-mask'

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name)
  private readonly uploadDir: string

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
      },
    })

    this.parseFileAsync(record.id, file.path, fileType, file.mimetype).catch((err) =>
      this.logger.error(`文件解析失败: ${record.id}`, err),
    )

    return record
  }

  /** 异步解析文件内容（图片/PDF 优先多模态视觉理解，再 OCR/文本提取） */
  private async parseFileAsync(
    fileId: string,
    filePath: string,
    fileType: FileType,
    mimeType: string,
  ) {
    await this.prisma.uploadedFile.update({ where: { id: fileId }, data: { status: FileStatus.PARSING } })

    try {
      let content = ''

      switch (fileType) {
        case FileType.PDF:
          content = await this.parsePdfWithVisionFallback(filePath)
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
          content = await this.parseImageVisionThenOcr(filePath, mimeType)
          break
        default:
          content = '不支持的文件格式'
      }

      const trimmed = content.trim()
      if (!trimmed || trimmed.startsWith('【解析失败】')) {
        throw new Error(trimmed || '内容为空，无法完成解析')
      }

      const masked = maskSensitivePlainText(content)
      const structured = await this.requirementStructure.structureRequirements(masked)

      await this.prisma.uploadedFile.update({
        where: { id: fileId },
        data: {
          parsedContent: masked,
          structuredRequirements: structured as Prisma.InputJsonValue,
          status: FileStatus.PARSED,
          parseError: null,
        },
      })
      this.logger.log(`文件解析完成: ${fileId}`)
    } catch (err) {
      const msg = ((err as Error).message || '解析失败').slice(0, 4000)
      await this.prisma.uploadedFile.update({
        where: { id: fileId },
        data: { status: FileStatus.FAILED, parseError: msg },
      })
      this.logger.error(`文件解析失败: ${fileId}`, err as Error)
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

  /** PDF：先文本提取；文本过少或强制开关时，对首页做视觉理解 */
  private async parsePdfWithVisionFallback(filePath: string): Promise<string> {
    let text = ''
    try {
      text = await this.parsePdf(filePath)
    } catch (e) {
      this.logger.warn(`pdf-parse 失败: ${(e as Error).message}`)
    }

    const minLen = parseInt(this.config.get<string>('VISION_PDF_MIN_TEXT_CHARS') || '120', 10)
    const forceVision = this.config.get<string>('VISION_PDF_ALWAYS') === '1'

    let visionBlock = ''
    const hasVision = !!(await this.documentVision.resolveVisionModel())
    if (hasVision && (text.trim().length < minLen || forceVision)) {
      const r = await this.documentVision.transcribePdfFirstPageVision(filePath)
      if (r?.text) {
        visionBlock = `【PDF 首页视觉理解｜${r.modelName}】\n${r.text.trim()}`
      }
    }

    if (visionBlock && text.trim()) {
      return `${visionBlock}\n\n---\n【PDF 文本提取】\n${text.trim()}`
    }
    if (visionBlock) return visionBlock
    if (text.trim()) return `【PDF 文本提取】\n${text.trim()}`

    return (
      '【解析失败】PDF 未提取到文本，且视觉理解未返回内容（扫描件需配置视觉模型；若部署未构建 canvas，PDF 转图会失败，见部署说明）。'
    )
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
    const {
      data: { text },
    } = await Tesseract.recognize(filePath, 'chi_sim+eng')
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

    if (fs.existsSync(file.path)) fs.unlinkSync(file.path)

    await this.prisma.uploadedFile.delete({ where: { id } })
  }

  /** 重新排队解析（上传页「重试」） */
  async retryParse(id: string, userId: string) {
    const file = await this.getFileById(id)
    if (file.uploaderId !== userId) throw new BadRequestException('无权操作该文件')
    if (!fs.existsSync(file.path)) throw new BadRequestException('本地文件已不存在，请重新上传')

    await this.prisma.uploadedFile.update({
      where: { id },
      data: {
        status: FileStatus.PENDING,
        parseError: null,
        parsedContent: null,
        structuredRequirements: Prisma.DbNull,
      },
    })

    this.parseFileAsync(file.id, file.path, file.fileType, file.mimeType).catch((e) =>
      this.logger.error(`重试解析失败: ${id}`, e),
    )

    return this.getFileById(id)
  }

  /**
   * 用户在前端编辑「原始文本」后，重新脱敏 + 结构化（不重新跑 OCR/视觉）
   */
  async restructureFromEditedText(id: string, userId: string, text: string) {
    const file = await this.getFileById(id)
    if (file.uploaderId !== userId) throw new BadRequestException('无权操作该文件')

    const masked = maskSensitivePlainText(text)
    const structured = await this.requirementStructure.structureRequirements(masked)

    await this.prisma.uploadedFile.update({
      where: { id },
      data: {
        parsedContent: masked,
        structuredRequirements: structured as Prisma.InputJsonValue,
        status: FileStatus.PARSED,
        parseError: null,
      },
    })

    return this.getFileById(id)
  }
}

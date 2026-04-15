import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import * as path from 'path'
import { FileStatus, FileType } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name)
  private readonly uploadDir: string

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.uploadDir = this.config.get<string>('UPLOAD_DIR', './uploads')
    // 确保上传目录存在
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

    // 异步解析文件内容
    this.parseFileAsync(record.id, file.path, fileType).catch((err) =>
      this.logger.error(`文件解析失败: ${record.id}`, err),
    )

    return record
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

    // 删除物理文件
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path)

    await this.prisma.uploadedFile.delete({ where: { id } })
  }
}

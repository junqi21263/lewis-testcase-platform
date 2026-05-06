import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage, memoryStorage } from 'multer'
import { extname } from 'path'
import { v4 as uuid } from 'uuid'
import { ApiTags, ApiOperation, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger'
import { FilesService } from './files.service'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { RestructureFileDto } from './dto/restructure-file.dto'
import { UploadChunkFieldsDto } from './dto/upload-chunk-fields.dto'
import { MergeChunksDto } from './dto/merge-chunks.dto'

/**
 * 解码文件名中的 UTF-8 编码（处理中文/繁体等非 ASCII 字符）
 * multer 默认使用 latin1 编码，需要转换为 UTF-8
 */
function decodeFilename(filename: string): string {
  try {
    // 尝试检测并解码 URL 编码的文件名
    if (filename.includes('%')) {
      return decodeURIComponent(filename)
    }
    // 尝试将 latin1 编码转换为 UTF-8
    const buffer = Buffer.from(filename, 'latin1')
    return buffer.toString('utf-8')
  } catch {
    return filename
  }
}

const DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024
const maxUploadBytes = parseInt(process.env.MAX_FILE_SIZE || String(DEFAULT_MAX_FILE_BYTES), 10)
const effectiveMaxUpload =
  Number.isFinite(maxUploadBytes) && maxUploadBytes > 0 ? maxUploadBytes : DEFAULT_MAX_FILE_BYTES
/** 单个分片请求体上限（略大于常见 2MB 分片） */
const chunkRequestBodyMax = Math.min(8 * 1024 * 1024, effectiveMaxUpload)

@ApiTags('文件管理')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Post('upload')
  @ApiOperation({ summary: '上传文件（单请求，适合不超过上限的小文件）' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: process.env.UPLOAD_DIR || './uploads',
        filename: (_req, file, cb) => {
          const uniqueName = `${uuid()}${extname(file.originalname)}`
          cb(null, uniqueName)
        },
      }),
      limits: { fileSize: effectiveMaxUpload },
    }),
  )
  upload(
    @UploadedFile(
      new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: effectiveMaxUpload })] }),
    )
    file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    // 解码文件名，处理中文/繁体等非 ASCII 字符
    file.originalname = decodeFilename(file.originalname)
    return this.filesService.saveUploadedFile(file, userId)
  }

  @Post('upload/chunk')
  @ApiOperation({ summary: '分片上传（单分片）' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('chunk', {
      storage: memoryStorage(),
      limits: { fileSize: chunkRequestBodyMax },
    }),
  )
  uploadChunk(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: chunkRequestBodyMax })],
      }),
    )
    chunk: Express.Multer.File,
    @Body() body: UploadChunkFieldsDto,
    @CurrentUser('id') userId: string,
  ) {
    if (!chunk.buffer?.length) {
      throw new BadRequestException('分片数据为空')
    }
    return this.filesService.saveUploadedChunk(
      userId,
      body.fileId,
      body.chunkIndex,
      body.chunkTotal,
      body.chunkSize,
      chunk.buffer,
    )
  }

  @Post('upload/merge')
  @ApiOperation({ summary: '合并分片并完成上传与解析排队' })
  mergeChunks(@Body() dto: MergeChunksDto, @CurrentUser('id') userId: string) {
    // 解码文件名，处理中文/繁体等非 ASCII 字符
    dto.originalName = decodeFilename(dto.originalName)
    return this.filesService.mergeChunkedUpload(userId, dto)
  }

  @Get()
  @ApiOperation({ summary: '获取文件列表' })
  getList(
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
  ) {
    return this.filesService.getFileList(userId, +page, +pageSize)
  }

  /** 须放在 @Get(':id') 之前，避免被误匹配 */
  @Post(':id/parse')
  @ApiOperation({ summary: '重新解析文件' })
  retryParse(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.filesService.retryParse(id, userId)
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: '取消正在解析的任务' })
  cancelTask(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.filesService.cancelTask(id, userId)
  }

  @Post(':id/restructure')
  @ApiOperation({ summary: '根据编辑后的全文重新结构化需求' })
  restructure(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RestructureFileDto,
  ) {
    return this.filesService.restructureFromEditedText(id, userId, dto.text)
  }

  @Get(':id')
  @ApiOperation({ summary: '获取文件详情' })
  getById(@Param('id') id: string) {
    return this.filesService.getFileById(id)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除文件' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.filesService.deleteFile(id, userId)
  }
}

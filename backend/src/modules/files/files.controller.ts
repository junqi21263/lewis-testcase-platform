import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { FileStorageProvider } from '@prisma/client'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname } from 'path'
import { v4 as uuid } from 'uuid'
import { ApiTags, ApiOperation, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger'
import { FilesService } from './files.service'
import { CurrentUser } from '@/common/decorators/current-user.decorator'

@ApiTags('文件管理')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Post('upload')
  @ApiOperation({ summary: '上传文件' })
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
      limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') },
    }),
  )
  upload(
    @UploadedFile(new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 })] }))
    file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    return this.filesService.saveUploadedFile(file, userId)
  }

  @Post('upload/chunk')
  @ApiOperation({ summary: '上传文件分片' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('chunk', {
      storage: diskStorage({
        destination: process.env.UPLOAD_DIR || './uploads',
        filename: (_req, _file, cb) => cb(null, `${uuid()}.chunk`),
      }),
      // 分片大小上限（字节）。默认放宽到 10MB，避免 2MB 边界条件/代理层差异导致 413
      limits: { fileSize: parseInt(process.env.MAX_CHUNK_SIZE || String(10 * 1024 * 1024)) },
    }),
  )
  uploadChunk(
    @UploadedFile(new ParseFilePipe({
      validators: [new MaxFileSizeValidator({ maxSize: parseInt(process.env.MAX_CHUNK_SIZE || String(10 * 1024 * 1024)) })],
    }))
    chunk: Express.Multer.File,
    @Body('fileId') fileId: string,
    @Body('chunkIndex') chunkIndex: string,
    @Body('chunkTotal') chunkTotal: string,
  ) {
    return this.filesService.saveUploadChunk(chunk, {
      fileId,
      chunkIndex: Number(chunkIndex),
      chunkTotal: Number(chunkTotal),
    })
  }

  @Post('upload/merge')
  @ApiOperation({ summary: '合并文件分片' })
  mergeChunks(
    @CurrentUser('id') userId: string,
    @Body() body: { fileId: string; originalName: string; mimeType: string; chunkTotal?: number },
  ) {
    return this.filesService.mergeUploadChunks(userId, body)
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

  @Get(':id')
  @ApiOperation({ summary: '获取文件详情' })
  getById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.filesService.getFileByIdForUser(id, userId)
  }

  @Get(':id/download')
  @ApiOperation({ summary: '获取文件下载链接（COS 优先）' })
  async getDownloadUrl(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.filesService.getDownloadUrl(id, userId)
  }

  @Post(':id/parse')
  @ApiOperation({ summary: '重新触发文件解析' })
  retryParse(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.filesService.retryParse(id, userId)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除文件' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.filesService.deleteFile(id, userId)
  }
}

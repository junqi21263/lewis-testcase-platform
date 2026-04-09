import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common'
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
  getById(@Param('id') id: string) {
    return this.filesService.getFileById(id)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除文件' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.filesService.deleteFile(id, userId)
  }
}

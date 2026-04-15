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
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname } from 'path'
import { v4 as uuid } from 'uuid'
import { ApiTags, ApiOperation, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger'
import { FilesService } from './files.service'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { RestructureFileDto } from './dto/restructure-file.dto'

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

  /** 须放在 @Get(':id') 之前，避免被误匹配 */
  @Post(':id/parse')
  @ApiOperation({ summary: '重新解析文件' })
  retryParse(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.filesService.retryParse(id, userId)
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

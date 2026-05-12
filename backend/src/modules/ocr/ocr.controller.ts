import {
  Controller,
  Get,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { memoryStorage } from 'multer'
import { OcrTaskService } from './ocr-task.service'
import { OcrCacheService } from './ocr-cache.service'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Roles } from '@/common/decorators/roles.decorator'
import { UserRole } from '@prisma/client'

@ApiTags('OCR')
@ApiBearerAuth()
@Controller('ocr')
export class OcrController {
  constructor(
    private readonly ocrTasks: OcrTaskService,
    private readonly ocrCache: OcrCacheService,
  ) {}

  @Post('upload')
  @ApiOperation({ summary: '上传图片，异步 OCR，立即返回 taskId' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('未收到文件')
    if (!file.mimetype?.startsWith('image/')) throw new BadRequestException('仅支持图片文件')
    return this.ocrTasks.createFromUpload(file, userId)
  }

  @Get('status/:taskId')
  @ApiOperation({ summary: '查询 OCR 任务状态与结果' })
  async status(@Param('taskId') taskId: string, @CurrentUser('id') userId: string) {
    const t = this.ocrTasks.get(taskId, userId)
    if (!t) throw new NotFoundException('任务不存在')
    return t
  }

  @Post('cache/clear')
  @ApiOperation({ summary: '清空服务端 OCR 文本缓存（管理员）' })
  @Roles(UserRole.ADMIN)
  clearCache() {
    const n = this.ocrCache.clearAll()
    return { cleared: n }
  }
}

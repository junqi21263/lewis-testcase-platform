import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { DocumentParseService } from './document-parse.service'
import { CreateDocumentParseRecordDto } from './dto/create-document-parse-record.dto'
import { CurrentUser } from '@/common/decorators/current-user.decorator'

@ApiTags('文档解析')
@ApiBearerAuth()
@Controller('document-parse')
export class DocumentParseController {
  constructor(private readonly service: DocumentParseService) {}

  @Post()
  @ApiOperation({ summary: '保存解析快照（带入生成前）' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateDocumentParseRecordDto) {
    return this.service.create(userId, dto)
  }

  @Get('recent')
  @ApiOperation({ summary: '最近解析快照列表' })
  listRecent(@CurrentUser('id') userId: string, @Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 10
    return this.service.listRecent(userId, Number.isFinite(n) ? n : 10)
  }
}

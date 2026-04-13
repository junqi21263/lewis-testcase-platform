import { Controller, Get, Delete, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { RecordsService } from './records.service'
import { CurrentUser } from '@/common/decorators/current-user.decorator'

@ApiTags('生成记录')
@ApiBearerAuth()
@Controller('records')
export class RecordsController {
  constructor(private service: RecordsService) {}

  @Get('summary')
  @ApiOperation({ summary: '工作台：生成记录汇总' })
  getSummary(@CurrentUser('id') userId: string) {
    return this.service.getSummary(userId)
  }

  @Get()
  @ApiOperation({ summary: '获取生成记录列表' })
  getList(
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.service.getRecords(userId, { page: +page, pageSize: +pageSize, status, keyword })
  }

  @Get(':id')
  @ApiOperation({ summary: '获取记录详情' })
  getById(@Param('id') id: string) {
    return this.service.getById(id)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除记录' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.delete(id, userId)
  }
}

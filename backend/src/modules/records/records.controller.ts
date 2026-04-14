import { Controller, Get, Delete, Param, Query, Post, Body } from '@nestjs/common'
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
    @Query('modelId') modelId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('minCaseCount') minCaseCount?: string,
    @Query('maxCaseCount') maxCaseCount?: string,
  ) {
    return this.service.getRecords(userId, {
      page: +page,
      pageSize: +pageSize,
      status,
      keyword,
      modelId,
      from,
      to,
      minCaseCount: minCaseCount != null ? Number(minCaseCount) : undefined,
      maxCaseCount: maxCaseCount != null ? Number(maxCaseCount) : undefined,
    })
  }

  @Get(':id')
  @ApiOperation({ summary: '获取记录详情' })
  getById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.getByIdForUser(id, userId)
  }

  @Get(':id/result')
  @ApiOperation({ summary: '查看结果页：获取记录聚合结果（record + suite + cases + stats）' })
  getResult(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.getResult(id, userId)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除记录' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.delete(id, userId)
  }

  @Post('batch-delete')
  @ApiOperation({ summary: '批量删除记录' })
  batchDelete(@Body() body: { ids: string[] }, @CurrentUser('id') userId: string) {
    return this.service.batchDelete(body.ids || [], userId)
  }
}

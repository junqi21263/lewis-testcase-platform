import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  Patch,
  Body,
  Post,
  Res,
  Ip,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { Response } from 'express'
import { RecordsService, type RecordsListParams } from './records.service'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { BatchRecordsDto } from './dto/batch-records.dto'
import { UpdateGenerationRecordDto } from './dto/update-generation-record.dto'
import { CreateRecordShareDto } from './dto/create-record-share.dto'
import type { SessionUser } from './records.types'
import { Public } from '@/common/decorators/public.decorator'
import { GenerationStatus } from '@prisma/client'

@ApiTags('生成记录')
@ApiBearerAuth()
@Controller('records')
export class RecordsController {
  constructor(private service: RecordsService) {}

  @Public()
  @Get('public/shares/:token')
  @ApiOperation({ summary: '分享内容查询（无需登录，校验令牌与有效期）' })
  getPublicShare(@Param('token') token: string) {
    return this.service.getPublicShareContent(token)
  }

  @Get('stats/team')
  @ApiOperation({ summary: '团队生成记录统计（团队管理员）' })
  getTeamStats(@CurrentUser() user: SessionUser) {
    return this.service.getTeamStats(user)
  }

  @Get('compare')
  @ApiOperation({ summary: '两条生成记录用例集差异对比' })
  compare(
    @CurrentUser() user: SessionUser,
    @Query('leftId') leftId: string,
    @Query('rightId') rightId: string,
  ) {
    return this.service.compare(leftId, rightId, user)
  }

  @Get('summary')
  @ApiOperation({ summary: '工作台：生成记录汇总（不含回收站，含团队可见范围）' })
  getSummary(@CurrentUser() user: SessionUser) {
    return this.service.getSummary(user)
  }

  @Get('meta/models')
  @ApiOperation({ summary: '当前访问范围内已使用过的模型列表（筛选用）' })
  getModels(@CurrentUser() user: SessionUser) {
    return this.service.getDistinctModels(user)
  }

  @Get('meta/ids')
  @ApiOperation({ summary: '与列表相同筛选条件下的记录 id（最多500条，用于全选）' })
  getMatchingIds(@CurrentUser() user: SessionUser, @Query() q: RecordsListParams) {
    return this.service.getMatchingIds(user, q)
  }

  @Post('batch')
  @ApiOperation({ summary: '批量操作（含批量打标签）' })
  batch(
    @CurrentUser() user: SessionUser,
    @Body() dto: BatchRecordsDto,
    @Ip() ip: string,
  ) {
    return this.service.batch(user, dto.ids, dto.action, dto.tags, ip)
  }

  @Get()
  @ApiOperation({
    summary: '获取生成记录列表',
    description:
      '支持 filterTeamId（仅 SUPER_ADMIN）、caseCountMin/Max、全文关键词（标题/需求/备注/用例内容）',
  })
  getList(@CurrentUser() user: SessionUser, @Query() q: RecordsListParams) {
    return this.service.getRecords(user, q)
  }

  @Get(':id/audit-logs')
  @ApiOperation({ summary: '记录操作审计日志' })
  listAudit(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Query('take') take?: string,
  ) {
    return this.service.listAuditLogs(id, user, take ? Number(take) : 200)
  }

  @Get(':id/downloads')
  @ApiOperation({ summary: '记录关联导出/下载历史（用例集流水 + 记录维度流水）' })
  listDownloads(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.service.listDownloadsForRecord(id, user)
  }

  @Get(':id/export')
  @ApiOperation({ summary: '导出关联用例集文件（EXCEL/JSON/MARKDOWN）' })
  async exportRecord(
    @Param('id') id: string,
    @Query('format') format = 'EXCEL',
    @CurrentUser() user: SessionUser,
    @Res() res: Response,
  ) {
    const { content, filename, mimeType } = await this.service.exportRecord(id, user, format)
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.setHeader('Content-Type', mimeType)
    res.send(content)
  }

  @Post(':id/shares')
  @ApiOperation({ summary: '创建分享链接（写入分享表）' })
  createShare(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: CreateRecordShareDto,
    @Ip() ip: string,
  ) {
    return this.service.createShare(id, user, dto, ip)
  }

  @Post(':id/archive')
  @ApiOperation({ summary: '归档记录（等价于 PATCH status=ARCHIVED）' })
  archive(@Param('id') id: string, @CurrentUser() user: SessionUser, @Ip() ip: string) {
    return this.service.patch(id, user, { status: GenerationStatus.ARCHIVED }, ip)
  }

  @Get(':id')
  @ApiOperation({ summary: '获取记录详情（含解析关联、审计摘要）' })
  getById(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.service.getById(id, user)
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新记录（标题、需求原文、标签、备注、状态等）' })
  patch(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: UpdateGenerationRecordDto,
    @Ip() ip: string,
  ) {
    return this.service.patch(id, user, dto, ip)
  }

  @Post(':id/restore')
  @ApiOperation({ summary: '从回收站恢复' })
  restore(@Param('id') id: string, @CurrentUser() user: SessionUser, @Ip() ip: string) {
    return this.service.restore(id, user, ip)
  }

  @Delete(':id/hard')
  @ApiOperation({ summary: '彻底删除（仅回收站中）' })
  hardDelete(@Param('id') id: string, @CurrentUser() user: SessionUser, @Ip() ip: string) {
    return this.service.permanentDelete(id, user, ip)
  }

  @Delete(':id')
  @ApiOperation({ summary: '移入回收站（软删除）' })
  delete(@Param('id') id: string, @CurrentUser() user: SessionUser, @Ip() ip: string) {
    return this.service.softDelete(id, user, ip)
  }
}

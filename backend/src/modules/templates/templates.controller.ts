import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, Res } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { TemplatesService } from './templates.service'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { CreateTemplateDto } from './dto/create-template.dto'
import { UpdateTemplateDto } from './dto/update-template.dto'
import { EvaluateTemplateDto } from './dto/evaluate-template.dto'

@ApiTags('提示词模板')
@ApiBearerAuth()
@Controller('templates')
export class TemplatesController {
  constructor(private service: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: '获取模板列表' })
  getList(
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.service.getTemplates(userId, { page: +page, pageSize: +pageSize, category, keyword })
  }

  @Get('evaluations/:jobId')
  @ApiOperation({ summary: '获取 Prompt 评测任务状态' })
  getEvaluationJob(@Param('jobId') jobId: string, @CurrentUser('id') userId: string) {
    return this.service.getEvaluationJob(jobId, userId)
  }

  @SkipThrottle()
  @Get('evaluations/:jobId/events')
  @ApiOperation({ summary: 'SSE：Prompt 评测任务进度' })
  streamEvaluationJob(
    @Param('jobId') jobId: string,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ) {
    return this.service.streamEvaluationJob(jobId, userId, res, req)
  }

  @Post('evaluations/:jobId/cancel')
  @ApiOperation({ summary: '取消 Prompt 评测任务' })
  cancelEvaluationJob(@Param('jobId') jobId: string, @CurrentUser('id') userId: string) {
    return this.service.cancelEvaluationJob(jobId, userId)
  }

  @Get(':id')
  @ApiOperation({ summary: '获取模板详情' })
  getById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.getById(id, userId)
  }

  @Post()
  @ApiOperation({ summary: '创建模板' })
  create(@CurrentUser('id') userId: string, @Body() data: CreateTemplateDto) {
    return this.service.create(userId, data)
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新模板' })
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Body() data: UpdateTemplateDto,
  ) {
    return this.service.update(id, userId, data, role)
  }

  @Post(':id/evaluations')
  @ApiOperation({ summary: '创建 Prompt 后台评测任务' })
  createEvaluationJob(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: EvaluateTemplateDto,
  ) {
    return this.service.createEvaluationJob(id, userId, dto)
  }

  @Post(':id/evaluate')
  @ApiOperation({ summary: '一键评测当前提示词模板' })
  evaluate(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: EvaluateTemplateDto,
  ) {
    return this.service.evaluate(id, userId, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除模板' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string, @CurrentUser('role') role: string) {
    return this.service.delete(id, userId, role)
  }
}

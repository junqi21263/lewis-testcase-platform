import { Controller, Get, Post, Body, Res, Header, Param, Query, HttpCode } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger'
import { Response } from 'express'
import { AiService } from './ai.service'
import { AnalysisReportPdfService } from './analysis-report-pdf.service'
import { GenerateDto } from './dto/generate.dto'
import { CreateAnalysisDto } from './dto/create-analysis.dto'
import { ExportAnalysisPdfDto } from './dto/export-analysis-pdf.dto'
import { TestModelConnectivityDto } from './dto/test-model-connectivity.dto'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Roles } from '@/common/decorators/roles.decorator'
import { UserRole } from '@prisma/client'

@ApiTags('AI 生成')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(
    private aiService: AiService,
    private analysisReportPdf: AnalysisReportPdfService,
  ) {}

  @Get('models')
  @ApiOperation({ summary: '获取可用模型列表' })
  getModels() {
    return this.aiService.getModels()
  }

  @Post('generate')
  @ApiOperation({ summary: '非流式生成测试用例' })
  generate(@Body() dto: GenerateDto, @CurrentUser('id') userId: string) {
    return this.aiService.generate(dto, userId)
  }

  @Post('records/:recordId/close-loop')
  @ApiOperation({ summary: 'AI 需求-用例闭环优化：生成最终推荐版' })
  closeLoop(@Param('recordId') recordId: string, @CurrentUser('id') userId: string) {
    return this.aiService.runRequirementCaseClosedLoop(recordId, userId)
  }

  @Post('generate/stream')
  @HttpCode(200)
  @ApiOperation({ summary: '流式生成测试用例（SSE）' })
  generateStream(
    @Body() dto: GenerateDto,
    @CurrentUser('id') userId: string,
    @Res() res: Response,
  ) {
    return this.aiService.generateStream(dto, userId, res)
  }

  @Post('analyze/stream')
  @HttpCode(200)
  @ApiOperation({ summary: '需求分析专用流式（SSE，不走用例管线）' })
  analyzeStream(
    @Body() dto: CreateAnalysisDto,
    @CurrentUser('id') userId: string,
    @Res() res: Response,
  ) {
    return this.aiService.analyzeStream(dto, userId, res)
  }

  @Get('analysis/records/:recordId/versions')
  @ApiOperation({ summary: 'AI 需求分析报告版本列表' })
  listAnalysisVersions(@Param('recordId') recordId: string, @CurrentUser('id') userId: string) {
    return this.aiService.listAnalysisVersions(recordId, userId)
  }

  @Get('streams/:recordId/snapshot')
  @ApiOperation({ summary: '获取 AI 流式输出 Redis 恢复快照' })
  getStreamSnapshot(@Param('recordId') recordId: string, @CurrentUser('id') userId: string) {
    return this.aiService.getStreamSnapshot(recordId, userId)
  }

  @Get('analysis/records/:recordId/diff')
  @ApiOperation({ summary: 'AI 需求分析报告版本 diff' })
  diffAnalysisVersions(
    @Param('recordId') recordId: string,
    @Query('leftVersionId') leftVersionId: string | undefined,
    @Query('rightVersionId') rightVersionId: string | undefined,
    @CurrentUser('id') userId: string,
  ) {
    return this.aiService.diffAnalysisVersions(recordId, userId, { leftVersionId, rightVersionId })
  }

  @Post('analysis/records/:recordId/cross-review')
  @ApiOperation({ summary: '异步触发 AI 需求分析多模型交叉评审' })
  triggerAnalysisCrossReview(@Param('recordId') recordId: string, @CurrentUser('id') userId: string) {
    return this.aiService.triggerAnalysisCrossReview(recordId, userId)
  }

  @Post('analyze/export-pdf')
  @ApiOperation({ summary: '导出 AI 需求分析报告为专业排版 PDF（pdfkit，适合打印与分享）' })
  @ApiResponse({ status: 200, description: 'application/pdf 二进制流' })
  @Header('Cache-Control', 'no-store')
  async exportAnalysisPdf(
    @Body() dto: ExportAnalysisPdfDto,
    @CurrentUser('id') userId: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    if (dto.recordId) {
      await this.aiService.assertCanAccessAnalysisRecord(dto.recordId, userId)
    }
    const pdf = await this.analysisReportPdf.render(dto)
    const base =
      (dto.documentTitle?.trim() &&
        encodeURIComponent(dto.documentTitle.trim().replace(/[\\/:*?"<>|]/g, '_'))) ||
      `analysis-report-${Date.now()}`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${base}.pdf`)
    res.setHeader('Content-Length', String(pdf.length))
    res.end(pdf)
  }

  @Post('test')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '管理员：测试模型连通性（小请求）' })
  testModel(@Body() body: TestModelConnectivityDto) {
    return this.aiService.testModelConnectivity(body)
  }
}

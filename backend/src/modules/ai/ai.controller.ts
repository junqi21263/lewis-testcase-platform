import { Controller, Get, Post, Body, Res, Header } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger'
import { Response } from 'express'
import { AiService } from './ai.service'
import { AnalysisReportPdfService } from './analysis-report-pdf.service'
import { GenerateDto } from './dto/generate.dto'
import { CreateAnalysisDto } from './dto/create-analysis.dto'
import { ExportAnalysisPdfDto } from './dto/export-analysis-pdf.dto'
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

  @Post('generate/stream')
  @ApiOperation({ summary: '流式生成测试用例（SSE）' })
  generateStream(
    @Body() dto: GenerateDto,
    @CurrentUser('id') userId: string,
    @Res() res: Response,
  ) {
    return this.aiService.generateStream(dto, userId, res)
  }

  @Post('analyze/stream')
  @ApiOperation({ summary: '需求分析专用流式（SSE，不走用例管线）' })
  analyzeStream(
    @Body() dto: CreateAnalysisDto,
    @CurrentUser('id') userId: string,
    @Res() res: Response,
  ) {
    return this.aiService.analyzeStream(dto, userId, res)
  }

  @Post('analyze/export-pdf')
  @ApiOperation({ summary: '导出 AI 需求分析报告为专业排版 PDF（pdfkit，适合打印与分享）' })
  @ApiResponse({ status: 200, description: 'application/pdf 二进制流' })
  @Header('Cache-Control', 'no-store')
  async exportAnalysisPdf(@Body() dto: ExportAnalysisPdfDto, @Res({ passthrough: false }) res: Response) {
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
  testModel(@Body() body: { modelConfigId?: string; prompt?: string }) {
    return this.aiService.testModelConnectivity(body)
  }
}

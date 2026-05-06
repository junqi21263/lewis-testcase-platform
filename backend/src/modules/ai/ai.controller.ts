import { Controller, Get, Post, Body, Res } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { Response } from 'express'
import { AiService } from './ai.service'
import { GenerateDto } from './dto/generate.dto'
import { CreateAnalysisDto } from './dto/create-analysis.dto'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Roles } from '@/common/decorators/roles.decorator'
import { UserRole } from '@prisma/client'

@ApiTags('AI 生成')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

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

  @Post('test')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '管理员：测试模型连通性（小请求）' })
  testModel(@Body() body: { modelConfigId?: string; prompt?: string }) {
    return this.aiService.testModelConnectivity(body)
  }
}

import { Controller, Get, Post, Body, Res } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { Response } from 'express'
import { AiService } from './ai.service'
import { GenerateDto } from './dto/generate.dto'
import { CurrentUser } from '@/common/decorators/current-user.decorator'

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
}

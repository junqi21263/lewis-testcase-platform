import { IsString, IsOptional, IsNumber, IsIn, Max, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CreateAnalysisDto {
  @ApiProperty({ enum: ['file', 'text'], description: '分析来源类型' })
  @IsIn(['file', 'text'])
  sourceType: 'file' | 'text'

  @ApiProperty({ required: false, description: '已上传文件 ID（sourceType=file 时必填）' })
  @IsOptional()
  @IsString()
  fileId?: string

  @ApiProperty({ required: false, description: '直接输入的需求文本（sourceType=text 时必填）' })
  @IsOptional()
  @IsString()
  text?: string

  @ApiProperty({ required: false, description: '自定义分析提示词' })
  @IsOptional()
  @IsString()
  customPrompt?: string

  @ApiProperty({ required: false, description: 'AI 模型配置 ID' })
  @IsOptional()
  @IsString()
  modelConfigId?: string

  @ApiProperty({ required: false, description: '最大输出 Token 数', default: 4096 })
  @IsOptional()
  @IsNumber()
  @Min(256)
  @Max(128000)
  maxTokens?: number
}

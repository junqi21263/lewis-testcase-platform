import { IsString, IsOptional, IsNumber, IsIn, Max, Min, IsArray, ArrayMaxSize, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CreateAnalysisDto {
  @ApiProperty({ enum: ['file', 'text'], description: '分析来源类型' })
  @IsIn(['file', 'text'])
  sourceType: 'file' | 'text'

  @ApiProperty({ required: false, description: '已上传文件 ID（sourceType=file 时必填）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  fileId?: string

  @ApiProperty({
    required: false,
    description: '附加文件 ID（多图等）；与 fileId 合计不超过 5；多于 1 个文件时须全部为图片且均已解析',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  additionalFileIds?: string[]

  @ApiProperty({ required: false, description: '直接输入的需求文本（sourceType=text 时必填）' })
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  text?: string

  @ApiProperty({ required: false, description: '自定义分析提示词' })
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  customPrompt?: string

  @ApiProperty({ required: false, description: 'AI 模型配置 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  modelConfigId?: string

  @ApiProperty({ required: false, description: '基于已有分析记录进行修订时的记录 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  baseRecordId?: string

  @ApiProperty({ required: false, description: '报告修订说明' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  revisionNote?: string

  @ApiProperty({ required: false, description: '最大输出 Token 数', default: 4096 })
  @IsOptional()
  @IsNumber()
  @Min(256)
  @Max(128000)
  maxTokens?: number
}

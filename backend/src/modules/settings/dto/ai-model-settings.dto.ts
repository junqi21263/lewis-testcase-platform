import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

export class CreateAiModelSettingsDto {
  @ApiProperty({ example: 'GPT-4o 生产' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string

  @ApiProperty({ example: 'OpenAI' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  provider: string

  @ApiProperty({ example: 'gpt-4o' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  modelId: string

  @ApiProperty({ example: 'https://api.openai.com/v1' })
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  baseUrl: string

  @ApiProperty({ description: 'API Key，明文仅在此传输，入库后不会在列表中回显' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  apiKey: string

  @ApiProperty({ required: false, default: 4096 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(256)
  @Max(128000)
  maxTokens?: number

  @ApiProperty({ required: false, default: 0.7 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @ApiProperty({ required: false, description: '是否支持多模态（image_url），用于文档视觉解析' })
  @IsOptional()
  @IsBoolean()
  supportsVision?: boolean

  @ApiProperty({
    required: false,
    description: '作为上传图片/PDF 视觉理解的专用模型（全局仅可启用一个）',
  })
  @IsOptional()
  @IsBoolean()
  useForDocumentVisionParse?: boolean
}

export class UpdateAiModelSettingsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  provider?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  modelId?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  baseUrl?: string

  @ApiProperty({ required: false, description: '留空则不修改原 Key' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(256)
  @Max(128000)
  maxTokens?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  supportsVision?: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  useForDocumentVisionParse?: boolean
}

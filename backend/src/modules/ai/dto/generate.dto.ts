import { IsString, IsOptional, IsNumber, IsBoolean, IsIn, Max, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class GenerateDto {
  @ApiProperty({ enum: ['file', 'text', 'url'] })
  @IsIn(['file', 'text', 'url'])
  sourceType: 'file' | 'text' | 'url'

  @IsOptional()
  @IsString()
  fileId?: string

  @IsOptional()
  @IsString()
  text?: string

  @IsOptional()
  @IsString()
  url?: string

  @IsOptional()
  @IsString()
  templateId?: string

  @IsOptional()
  @IsString()
  customPrompt?: string

  @IsOptional()
  @IsString()
  modelConfigId?: string

  @IsOptional()
  @IsNumber()
  temperature?: number

  @IsOptional()
  @IsNumber()
  @Min(256)
  @Max(128000)
  maxTokens?: number

  @IsOptional()
  @IsBoolean()
  stream?: boolean
}

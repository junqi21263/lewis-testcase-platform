import { IsString, IsOptional, IsNumber, IsBoolean, IsIn, Max, Min, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class GenerateDto {
  @ApiProperty({ enum: ['file', 'text'] })
  @IsIn(['file', 'text'])
  sourceType: 'file' | 'text'

  @IsOptional()
  @IsString()
  @MaxLength(128)
  fileId?: string

  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  text?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  templateId?: string

  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  customPrompt?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
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

  @IsOptional()
  @IsBoolean()
  forceConfiguredModel?: boolean
}

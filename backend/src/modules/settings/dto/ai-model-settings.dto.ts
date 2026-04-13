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
}

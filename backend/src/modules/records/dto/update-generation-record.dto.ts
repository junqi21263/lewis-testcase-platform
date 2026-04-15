import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { GenerationStatus } from '@prisma/client'

export class UpdateGenerationRecordDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prompt?: string

  @ApiPropertyOptional({ description: '需求原文副本字段，与 prompt 同步写入' })
  @IsOptional()
  @IsString()
  demandContent?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  remark?: string

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  tags?: string[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  notes?: string

  @ApiPropertyOptional({ enum: GenerationStatus })
  @IsOptional()
  @IsEnum(GenerationStatus)
  status?: GenerationStatus
}

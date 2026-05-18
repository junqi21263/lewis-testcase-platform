import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { TemplateCategory } from '@prisma/client'
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'

export class CreateTemplateDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  name: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string

  @ApiPropertyOptional({ enum: TemplateCategory, default: TemplateCategory.CUSTOM })
  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory

  @ApiProperty()
  @IsString()
  @MaxLength(50000)
  content: string

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  variables?: unknown[]

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean
}

import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class ExportAnalysisPdfDto {
  @ApiProperty({ description: 'Markdown 格式的分析报告正文', maxLength: 2_000_000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000_000)
  markdown!: string

  @ApiPropertyOptional({ description: '文档主标题（封面一级标题）；不传则从正文首行 # 推断或使用默认' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  documentTitle?: string

  @ApiPropertyOptional({ description: '页眉右侧版本号，如 V1.0', example: 'V1.0' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  version?: string
}

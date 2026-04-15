import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class RequirementSnapshotDto {
  @ApiProperty()
  @IsString()
  id: string

  @ApiProperty()
  @IsString()
  content: string

  @ApiProperty()
  @IsBoolean()
  selected: boolean

  @ApiProperty()
  @IsString()
  sourceFile: string
}

export class CreateDocumentParseRecordDto {
  @ApiProperty({ description: '快照标题' })
  @IsString()
  title: string

  @ApiProperty({ description: '脱敏后的原始全文' })
  @IsString()
  rawText: string

  @ApiProperty({ type: [RequirementSnapshotDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequirementSnapshotDto)
  requirements: RequirementSnapshotDto[]

  @ApiProperty({ description: '已填充变量的完整提示词' })
  @IsString()
  filledPrompt: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  fileIds: string[]
}

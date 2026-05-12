import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

class BatchTaskFileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  uploadedFileId?: string

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  fileName: string

  @ApiProperty({ enum: ['IMAGE', 'PDF', 'WORD', 'EXCEL', 'TEXT', 'YAML', 'JSON', 'OTHER'] })
  @IsIn(['IMAGE', 'PDF', 'WORD', 'EXCEL', 'TEXT', 'YAML', 'JSON', 'OTHER'])
  fileKind: 'IMAGE' | 'PDF' | 'WORD' | 'EXCEL' | 'TEXT' | 'YAML' | 'JSON' | 'OTHER'
}

export class CreateBatchTaskDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title: string

  @ApiProperty({ enum: ['FILE_PARSE', 'AI_ANALYSIS', 'TESTCASE_GENERATION'] })
  @IsIn(['FILE_PARSE', 'AI_ANALYSIS', 'TESTCASE_GENERATION'])
  moduleType: 'FILE_PARSE' | 'AI_ANALYSIS' | 'TESTCASE_GENERATION'

  @ApiProperty({ type: [BatchTaskFileDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchTaskFileDto)
  files: BatchTaskFileDto[]
}

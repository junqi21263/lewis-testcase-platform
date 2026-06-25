import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { CaseReviewStatus, TestCaseCommentType, TestCasePriority, TestCaseType } from '@prisma/client'

export class ReviewStepDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  order!: number

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  action!: string

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  expected?: string
}

export class SaveReviewCaseDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  title!: string

  @ApiProperty({ enum: TestCasePriority })
  @IsEnum(TestCasePriority)
  priority!: TestCasePriority

  @ApiProperty({ enum: TestCaseType })
  @IsEnum(TestCaseType)
  type!: TestCaseType

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(80)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  tags!: string[]

  @ApiPropertyOptional({ maxLength: 8000 })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  precondition?: string

  @ApiProperty({ type: [ReviewStepDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReviewStepDto)
  steps!: ReviewStepDto[]

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(4000, { each: true })
  expectedResults!: string[]

  @ApiProperty({ maxLength: 16000 })
  @IsString()
  @MaxLength(16000)
  expectedResult!: string

  @ApiPropertyOptional({ maxLength: 8000 })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  remarks?: string

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  requirementIds?: string[]

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  testPathIds?: string[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  automationReadiness?: Record<string, unknown>
}

export class UpdateReviewStatusDto {
  @ApiProperty({ enum: CaseReviewStatus })
  @IsEnum(CaseReviewStatus)
  status!: CaseReviewStatus

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string

  @ApiPropertyOptional({ enum: TestCaseCommentType })
  @IsOptional()
  @IsEnum(TestCaseCommentType)
  commentType?: TestCaseCommentType
}

export class BatchReviewStatusDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  caseIds!: string[]

  @ApiProperty({ enum: CaseReviewStatus })
  @IsEnum(CaseReviewStatus)
  status!: CaseReviewStatus

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string
}

export class ExecutionResultDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  caseId?: string

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reqId?: string

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  tpId?: string

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string

  @ApiProperty({ enum: ['passed', 'failed', 'skipped'] })
  @IsIn(['passed', 'failed', 'skipped'])
  status!: 'passed' | 'failed' | 'skipped'

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  errorMessage?: string

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reportUrl?: string

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  traceUrl?: string
}

export class ImportExecutionResultsDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  summary?: string

  @ApiPropertyOptional({ type: [ExecutionResultDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ExecutionResultDto)
  results?: ExecutionResultDto[]
}

export class AddReviewCommentDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  content!: string

  @ApiPropertyOptional({ enum: TestCaseCommentType })
  @IsOptional()
  @IsEnum(TestCaseCommentType)
  commentType?: TestCaseCommentType
}

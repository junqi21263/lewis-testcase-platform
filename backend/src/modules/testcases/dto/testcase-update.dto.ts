import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
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
import { TestCasePriority, TestCaseStatus, TestCaseType } from '@prisma/client'

export class CreateSuiteDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name!: string

  @ApiPropertyOptional({ maxLength: 8000 })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  projectName?: string
}

export class UpdateSuiteDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string

  @ApiPropertyOptional({ maxLength: 8000 })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string

  @ApiPropertyOptional({ enum: TestCaseStatus })
  @IsOptional()
  @IsEnum(TestCaseStatus)
  status?: TestCaseStatus
}

export class UpdateTestStepDto {
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

export class UpdateTestCaseDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string

  @ApiPropertyOptional({ maxLength: 8000 })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string

  @ApiPropertyOptional({ maxLength: 8000 })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  precondition?: string

  @ApiPropertyOptional({ maxLength: 16000 })
  @IsOptional()
  @IsString()
  @MaxLength(16000)
  expectedResult?: string

  @ApiPropertyOptional({ maxLength: 16000 })
  @IsOptional()
  @IsString()
  @MaxLength(16000)
  actualResult?: string

  @ApiPropertyOptional({ type: [UpdateTestStepDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => UpdateTestStepDto)
  steps?: UpdateTestStepDto[]

  @ApiPropertyOptional({ enum: TestCasePriority })
  @IsOptional()
  @IsEnum(TestCasePriority)
  priority?: TestCasePriority

  @ApiPropertyOptional({ enum: TestCaseType })
  @IsOptional()
  @IsEnum(TestCaseType)
  type?: TestCaseType

  @ApiPropertyOptional({ enum: TestCaseStatus })
  @IsOptional()
  @IsEnum(TestCaseStatus)
  status?: TestCaseStatus

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  tags?: string[]

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

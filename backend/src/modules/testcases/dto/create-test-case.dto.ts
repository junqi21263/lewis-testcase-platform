import { IsArray, IsEnum, IsOptional, IsString, ValidateNested, IsInt } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { TestCasePriority, TestCaseType } from '@prisma/client'

export class TestStepInputDto {
  @ApiProperty()
  @IsInt()
  order: number

  @ApiProperty()
  @IsString()
  action: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expected?: string
}

export class CreateTestCaseDto {
  @ApiProperty()
  @IsString()
  title: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  precondition?: string

  @ApiProperty()
  @IsString()
  expectedResult: string

  @ApiPropertyOptional({ type: [TestStepInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestStepInputDto)
  steps?: TestStepInputDto[]

  @ApiPropertyOptional({ enum: TestCasePriority })
  @IsOptional()
  @IsEnum(TestCasePriority)
  priority?: TestCasePriority

  @ApiPropertyOptional({ enum: TestCaseType })
  @IsOptional()
  @IsEnum(TestCaseType)
  type?: TestCaseType
}

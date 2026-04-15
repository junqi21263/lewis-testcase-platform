import { IsString, IsOptional, IsNumber, IsBoolean, IsIn, ValidateNested, IsObject } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'

class GenerationOptionsDto {
  @IsOptional()
  @IsString()
  testType?: string

  @IsOptional()
  @IsString()
  granularity?: string

  @IsOptional()
  @IsString()
  priorityRule?: string

  @IsOptional()
  @IsNumber()
  sceneNormal?: number

  @IsOptional()
  @IsNumber()
  sceneAbnormal?: number

  @IsOptional()
  @IsNumber()
  sceneBoundary?: number

  /** 自动化脚本：编程语言，如 Python */
  @IsOptional()
  @IsString()
  programmingLanguage?: string

  /** 自动化脚本：测试框架，如 Pytest */
  @IsOptional()
  @IsString()
  testFramework?: string

  /** 自动化脚本：测试对象描述，如 接口 / 登录 UI */
  @IsOptional()
  @IsString()
  testTarget?: string

  /** 自动化脚本：额外要求，如 Allure、CI/CD */
  @IsOptional()
  @IsString()
  extraRequirements?: string
}

export class GenerateDto {
  @ApiProperty({ enum: ['file', 'text', 'url'] })
  @IsIn(['file', 'text', 'url'])
  sourceType: 'file' | 'text' | 'url'

  @IsOptional()
  @IsString()
  fileId?: string

  @IsOptional()
  @IsString()
  text?: string

  @IsOptional()
  @IsString()
  url?: string

  @IsOptional()
  @IsString()
  templateId?: string

  @IsOptional()
  @IsString()
  customPrompt?: string

  @IsOptional()
  @IsString()
  userNotes?: string

  @IsOptional()
  @IsString()
  outputLanguage?: string

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => GenerationOptionsDto)
  generationOptions?: GenerationOptionsDto

  @IsOptional()
  @IsString()
  modelConfigId?: string

  @IsOptional()
  @IsNumber()
  temperature?: number

  @IsOptional()
  @IsNumber()
  maxTokens?: number

  @IsOptional()
  @IsBoolean()
  stream?: boolean
}

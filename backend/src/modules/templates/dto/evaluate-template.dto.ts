import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'

export class EvaluateTemplateDto {
  @IsOptional()
  @IsString()
  modelConfigId?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  sampleLimit?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number

  @IsOptional()
  @IsInt()
  @Min(256)
  @Max(128000)
  maxTokens?: number
}

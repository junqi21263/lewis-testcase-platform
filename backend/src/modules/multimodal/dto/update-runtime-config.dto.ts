import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'

export class UpdateRuntimeConfigDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  multimodalEnabled?: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  multimodalDefaultModel?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  textFallbackModel?: string

  @ApiProperty({ required: false, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  maxConcurrentTasks?: number

  @ApiProperty({ required: false, minimum: 1, maximum: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(30)
  cacheTtlDays?: number

  @ApiProperty({ required: false, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyCostAlertCny?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  autoDowngradeWhenOverBudget?: boolean

  @ApiProperty({ required: false, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  multimodalInputPricePer1kCny?: number

  @ApiProperty({ required: false, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  multimodalOutputPricePer1kCny?: number

  @ApiProperty({ required: false, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  textInputPricePer1kCny?: number

  @ApiProperty({ required: false, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  textOutputPricePer1kCny?: number
}

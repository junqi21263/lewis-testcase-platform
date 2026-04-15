import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsObject, IsOptional, Max, Min } from 'class-validator'

export class CreateRecordShareDto {
  @ApiPropertyOptional({ description: '有效天数，不传则永不过期（仍受手动撤销影响）', minimum: 1, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresDays?: number

  @ApiPropertyOptional({ description: '权限 JSON，如 { "viewDemand": true, "viewCases": true }' })
  @IsOptional()
  @IsObject()
  permission?: Record<string, unknown>
}

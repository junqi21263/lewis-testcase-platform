import { IsEnum, IsOptional } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { GenerationStatus } from '@prisma/client'

export class PatchRecordDto {
  @ApiPropertyOptional({ enum: GenerationStatus })
  @IsOptional()
  @IsEnum(GenerationStatus)
  status?: GenerationStatus
}

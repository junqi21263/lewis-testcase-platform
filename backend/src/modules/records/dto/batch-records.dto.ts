import {
  IsArray,
  IsIn,
  IsString,
  ArrayMinSize,
  ValidateIf,
  ArrayMaxSize,
  IsDefined,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export const BATCH_RECORD_ACTIONS = [
  'SOFT_DELETE',
  'RESTORE',
  'ARCHIVE',
  'CANCEL',
  'PERMANENT_DELETE',
  'UPDATE_TAGS',
] as const

export type BatchRecordAction = (typeof BATCH_RECORD_ACTIONS)[number]

export class BatchRecordsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids: string[]

  @ApiProperty({ enum: BATCH_RECORD_ACTIONS })
  @IsIn([...BATCH_RECORD_ACTIONS])
  action: BatchRecordAction

  @ApiPropertyOptional({ type: [String], description: '仅 action=UPDATE_TAGS 时必填' })
  @ValidateIf((o: BatchRecordsDto) => o.action === 'UPDATE_TAGS')
  @IsDefined()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  tags?: string[]
}

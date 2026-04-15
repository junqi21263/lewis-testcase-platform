import { IsArray, IsIn, IsString, ArrayMinSize } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export const BATCH_RECORD_ACTIONS = [
  'SOFT_DELETE',
  'RESTORE',
  'ARCHIVE',
  'CANCEL',
  'PERMANENT_DELETE',
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
}

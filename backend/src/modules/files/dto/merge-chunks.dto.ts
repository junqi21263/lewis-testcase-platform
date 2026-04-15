import { IsInt, IsString, IsUUID, Max, Min, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'

export class MergeChunksDto {
  @ApiProperty()
  @IsUUID('4')
  fileId: string

  @ApiProperty()
  @IsString()
  @MinLength(1)
  originalName: string

  @ApiProperty()
  @IsString()
  @MinLength(1)
  mimeType: string

  @ApiProperty({ description: '分片总数，须与上传阶段一致' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(256)
  chunkTotal: number
}

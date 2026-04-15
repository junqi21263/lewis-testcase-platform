import { Type } from 'class-transformer'
import { IsInt, IsUUID, Max, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class UploadChunkFieldsDto {
  @ApiProperty()
  @IsUUID('4')
  fileId: string

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  chunkIndex: number

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(256)
  chunkTotal: number

  @ApiProperty({ description: '客户端约定的分片大小（字节）' })
  @Type(() => Number)
  @IsInt()
  @Min(1024)
  @Max(8 * 1024 * 1024)
  chunkSize: number
}

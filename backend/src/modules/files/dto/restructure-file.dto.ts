import { IsString, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class RestructureFileDto {
  @ApiProperty({ description: '用户编辑后的原始全文（将脱敏并重新结构化）' })
  @IsString()
  @MinLength(1, { message: '文本不能为空' })
  text: string
}

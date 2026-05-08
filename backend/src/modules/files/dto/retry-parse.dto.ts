import { IsBoolean, IsOptional } from 'class-validator'

export class RetryParseDto {
  /** 仅使用 PDF 内置文本层，不执行 OCR/视觉（适合扫描件失败时改走完整解析） */
  @IsOptional()
  @IsBoolean()
  textOnly?: boolean
}

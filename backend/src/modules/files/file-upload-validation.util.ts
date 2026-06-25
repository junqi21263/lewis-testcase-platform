import { BadRequestException } from '@nestjs/common'
import * as path from 'path'

export const ALLOWED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/x-yaml',
  'application/yaml',
  'text/yaml',
  'text/x-yaml',
  'text/plain',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
] as const

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.yaml',
  '.yml',
  '.txt',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
])

export function isAllowedUploadMimeType(mimeType?: string | null): boolean {
  const normalized = (mimeType || '').trim().toLowerCase()
  return ALLOWED_UPLOAD_MIME_TYPES.includes(normalized as (typeof ALLOWED_UPLOAD_MIME_TYPES)[number])
}

export function assertAllowedUploadIdentity(originalName: string, mimeType: string): void {
  const ext = path.extname(originalName || '').toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new BadRequestException('不支持的文件扩展名')
  }
  if (!isAllowedUploadMimeType(mimeType)) {
    throw new BadRequestException('不支持的文件 MIME 类型')
  }
}

function startsWith(buf: Buffer, bytes: number[]): boolean {
  if (buf.length < bytes.length) return false
  return bytes.every((b, i) => buf[i] === b)
}

function isProbablyText(buf: Buffer): boolean {
  if (buf.length === 0) return false
  const sample = buf.subarray(0, Math.min(buf.length, 4096))
  let suspicious = 0
  for (const byte of sample) {
    if (byte === 0) return false
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1
  }
  return suspicious / sample.length < 0.05
}

export function assertUploadMagicNumber(buf: Buffer, originalName: string, mimeType: string): void {
  assertAllowedUploadIdentity(originalName, mimeType)
  const ext = path.extname(originalName || '').toLowerCase()
  const mime = (mimeType || '').toLowerCase()
  const isZipBased = startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0x50, 0x4b, 0x05, 0x06])
  const isOle = startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

  const ok =
    (ext === '.pdf' && startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) ||
    (['.png'].includes(ext) && startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) ||
    (['.jpg', '.jpeg'].includes(ext) && startsWith(buf, [0xff, 0xd8, 0xff])) ||
    (ext === '.webp' && buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') ||
    (['.docx', '.xlsx'].includes(ext) && isZipBased) ||
    (['.doc', '.xls'].includes(ext) && isOle) ||
    (['.txt', '.yaml', '.yml', '.json'].includes(ext) && isProbablyText(buf))

  if (!ok) {
    throw new BadRequestException(`文件内容与声明类型不一致：${mime || ext}`)
  }
}

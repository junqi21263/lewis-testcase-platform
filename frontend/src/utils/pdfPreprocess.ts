import { PDFDocument } from 'pdf-lib'

/** 上传前校验 PDF；大于 10MB 时尝试无损重写以减小体积（移除冗余对象流） */
export async function preprocessPdfForUpload(file: File): Promise<File> {
  if (!file.name.toLowerCase().endsWith('.pdf')) return file
  const buf = await file.arrayBuffer()
  try {
    await PDFDocument.load(buf, { ignoreEncryption: true })
  } catch (e) {
    throw new Error(`PDF 无法打开（文件可能损坏或已加密）：${(e as Error).message}`)
  }

  const tenMb = 10 * 1024 * 1024
  if (file.size <= tenMb) return file

  const doc = await PDFDocument.load(buf, { ignoreEncryption: true })
  const saved = await doc.save({ useObjectStreams: false })
  if (saved.byteLength >= file.size * 0.97) {
    return file
  }
  const copy = new Uint8Array(saved.byteLength)
  copy.set(saved)
  return new File([copy], file.name.replace(/\.pdf$/i, '') + '.pdf', { type: 'application/pdf' })
}

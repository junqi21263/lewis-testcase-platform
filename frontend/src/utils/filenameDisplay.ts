/**
 * 尝试修复「UTF-8 字节被当作 Latin-1 解码」导致的文件名乱码（常见于部分网关/存储链路）。
 * 若字符串已是正常 BMP 汉字则原样返回。
 */
export function normalizeUploadedFilename(name: string): string {
  if (!name || typeof name !== 'string') return name
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) > 255) return name
  }
  const bytes = new Uint8Array(name.length)
  for (let i = 0; i < name.length; i++) bytes[i] = name.charCodeAt(i)
  const recovered = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  if (recovered.includes('\uFFFD')) return name
  const hadWide = /[^\u0000-\u007f]/.test(name)
  const recoveredWide = /[^\u0000-\u007f]/.test(recovered)
  if (!hadWide && recoveredWide) return recovered
  if (recovered !== name && recoveredWide) return recovered
  return name
}

/**
 * 大图上传前在浏览器侧降采样，减轻带宽与视觉 API 耗时。
 * 仅处理 image/*；失败时由调用方回退为原文件。
 */

const MAX_EDGE = 2048
const JPEG_QUALITY = 0.82

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}

/**
 * 若图片任一边大于 maxEdge 或体积大于 maxBytes，则压缩为 JPEG 后返回新 File。
 */
export async function compressImageIfNeeded(
  file: File,
  maxEdge = MAX_EDGE,
  maxBytes = 8 * 1024 * 1024,
): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (file.size <= maxBytes && file.type === 'image/jpeg') {
    const img = await loadImage(file)
    if (img.naturalWidth <= maxEdge && img.naturalHeight <= maxEdge) {
      return file
    }
  }

  const img = await loadImage(file)
  let { naturalWidth: w, naturalHeight: h } = img
  if (w <= 0 || h <= 0) return file

  const scale = Math.min(1, maxEdge / Math.max(w, h))
  const tw = Math.max(1, Math.round(w * scale))
  const th = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(img, 0, 0, tw, th)

  const blob: Blob | null = await new Promise((res) =>
    canvas.toBlob((b) => res(b), 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob || blob.size === 0) return file

  const base = file.name.replace(/\.[^.]+$/, '') || 'image'
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}

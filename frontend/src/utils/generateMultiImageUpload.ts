import type { UploadedFile } from '@/types'

export const MAX_GENERATE_IMAGE_UPLOADS = 5

type FileLike = Pick<File, 'name' | 'type'>

export type GenerateUploadSelection = {
  mode: 'single' | 'multi-image'
  accepted: File[]
  rejected: File[]
  warning?: string
}

export function isGenerateImageFile(file: FileLike): boolean {
  const name = file.name.toLowerCase()
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name)
}

export function selectGenerateUploadFiles(files: File[]): GenerateUploadSelection {
  const list = Array.from(files).filter(Boolean)
  if (list.length === 0) return { mode: 'single', accepted: [], rejected: [] }

  const allImages = list.every(isGenerateImageFile)
  if (!allImages) {
    return {
      mode: 'single',
      accepted: [list[0]],
      rejected: list.slice(1),
      warning: list.length > 1 ? '非图片文档仍按单文件上传，本次仅使用第 1 个文件。' : undefined,
    }
  }

  const accepted = list.slice(0, MAX_GENERATE_IMAGE_UPLOADS)
  const rejected = list.slice(MAX_GENERATE_IMAGE_UPLOADS)
  return {
    mode: 'multi-image',
    accepted,
    rejected,
    warning: rejected.length > 0 ? `最多 5 张图片，本次已自动忽略 ${rejected.length} 张。` : undefined,
  }
}

export function isUploadedImageFile(file: UploadedFile): boolean {
  return file.fileType === 'IMAGE' || file.mimeType.startsWith('image/')
}

export function buildMultiImageGenerationText(files: UploadedFile[]): string {
  const parsed = files
    .filter((file) => file.status === 'PARSED')
    .map((file, index) => {
      const content = file.parsedContent?.trim()
      if (!content) return ''
      return [
        `## 图片 ${index + 1}：${file.originalName}`,
        '',
        content,
      ].join('\n')
    })
    .filter(Boolean)

  if (parsed.length === 0) return ''
  return [
    '# 多图需求输入',
    '以下内容来自多张设计图/截图 OCR 或视觉解析结果，请按图片顺序综合理解页面流程、交互状态和异常提示，生成与图片内容直接相关的测试用例。',
    '',
    ...parsed,
  ].join('\n\n')
}

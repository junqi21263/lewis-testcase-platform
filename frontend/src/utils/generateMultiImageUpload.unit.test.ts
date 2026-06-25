import { describe, expect, it } from 'vitest'
import {
  buildMultiImageGenerationText,
  MAX_GENERATE_IMAGE_UPLOADS,
  selectGenerateUploadFiles,
} from './generateMultiImageUpload'
import type { UploadedFile } from '@/types'

function file(name: string, type: string): File {
  return { name, type } as File
}

function uploaded(partial: Partial<UploadedFile>): UploadedFile {
  return {
    id: partial.id ?? 'file-1',
    name: partial.name ?? partial.originalName ?? 'image.png',
    originalName: partial.originalName ?? partial.name ?? 'image.png',
    size: partial.size ?? 100,
    mimeType: partial.mimeType ?? 'image/png',
    fileType: partial.fileType ?? 'IMAGE',
    status: partial.status ?? 'PARSED',
    parsedContent: partial.parsedContent,
    uploaderId: partial.uploaderId ?? 'user-1',
    createdAt: partial.createdAt ?? '2026-06-25T00:00:00.000Z',
  }
}

describe('generate multi image upload rules', () => {
  it('accepts at most five images when all selected files are images', () => {
    const files = Array.from({ length: 6 }, (_, i) => file(`screen-${i + 1}.png`, 'image/png'))

    const result = selectGenerateUploadFiles(files)

    expect(MAX_GENERATE_IMAGE_UPLOADS).toBe(5)
    expect(result.mode).toBe('multi-image')
    expect(result.accepted).toHaveLength(5)
    expect(result.rejected).toHaveLength(1)
    expect(result.warning).toContain('最多 5 张图片')
  })

  it('keeps legacy single-file mode when selection contains a non-image document', () => {
    const result = selectGenerateUploadFiles([
      file('flow.pdf', 'application/pdf'),
      file('screen-1.png', 'image/png'),
    ])

    expect(result.mode).toBe('single')
    expect(result.accepted.map((item) => item.name)).toEqual(['flow.pdf'])
    expect(result.warning).toContain('非图片文档仍按单文件上传')
  })

  it('combines parsed image text into named generation sections', () => {
    const text = buildMultiImageGenerationText([
      uploaded({ id: '1', originalName: '1-首页.png', parsedContent: '首页包含登录按钮' }),
      uploaded({ id: '2', originalName: '2-验证码.png', parsedContent: '验证码输入框和发送按钮' }),
    ])

    expect(text).toContain('多图需求输入')
    expect(text).toContain('1-首页.png')
    expect(text).toContain('首页包含登录按钮')
    expect(text).toContain('2-验证码.png')
    expect(text).toContain('验证码输入框和发送按钮')
  })
})

import { CosStorageService, sanitizeCosObjectKey } from '@/modules/files/cos-storage.service'

describe('COS path normalization (inline # comment in object key)', () => {
  it('sanitizeCosObjectKey removes space-hash-comment slash segment', () => {
    const dirty =
      'ai-uploads/ # 上传文件的前缀目录，方便管理/b2941a25-850a-4eb6-a0f3-4acd49c0a351.png'
    expect(sanitizeCosObjectKey(dirty)).toBe(
      'ai-uploads/b2941a25-850a-4eb6-a0f3-4acd49c0a351.png',
    )
  })

  it('normalizeCosStoredPath cleans full cos:// URI', () => {
    const dirty =
      'cos://ap-guangzhou/lewistest-1420560890/ai-uploads/ # 上传文件的前缀目录，方便管理/b2941a25-850a-4eb6-a0f3-4acd49c0a351.png'
    expect(CosStorageService.normalizeCosStoredPath(dirty)).toBe(
      'cos://ap-guangzhou/lewistest-1420560890/ai-uploads/b2941a25-850a-4eb6-a0f3-4acd49c0a351.png',
    )
  })

  it('leaves clean URIs unchanged', () => {
    const ok =
      'cos://ap-guangzhou/lewistest-1420560890/ai-uploads/b2941a25-850a-4eb6-a0f3-4acd49c0a351.png'
    expect(CosStorageService.normalizeCosStoredPath(ok)).toBe(ok)
  })
})

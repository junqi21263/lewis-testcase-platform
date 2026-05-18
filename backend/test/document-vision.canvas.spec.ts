import { DocumentVisionService } from '@/modules/files/document-vision.service'

describe('DocumentVisionService canvas probe', () => {
  it('isPdfPageRenderAvailable returns boolean without throwing', () => {
    const svc = new DocumentVisionService({} as any, { get: jest.fn() } as any)
    expect(typeof svc.isPdfPageRenderAvailable()).toBe('boolean')
  })
})

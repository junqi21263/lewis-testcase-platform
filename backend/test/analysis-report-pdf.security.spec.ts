import { BadRequestException } from '@nestjs/common'
import { AnalysisReportPdfService } from '@/modules/ai/analysis-report-pdf.service'

describe('AnalysisReportPdfService mermaid image guards', () => {
  const service = new AnalysisReportPdfService()

  it('rejects invalid base64 payload', async () => {
    await expect(
      service.render({
        markdown: '# Report',
        mermaidImagesBase64: ['not-base64!!!'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects oversize single image bytes', async () => {
    const huge = Buffer.alloc(5 * 1024 * 1024 + 1, 1).toString('base64')
    await expect(
      service.render({
        markdown: '# Report',
        mermaidImagesBase64: [huge],
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})

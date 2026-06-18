import { BadRequestException } from '@nestjs/common'
import { CoverageIntegrationService } from '@/modules/integrations/coverage-integration.service'

describe('CoverageIntegrationService', () => {
  it('normalizes coverage matrix export payloads for dry-run integrations', async () => {
    const service = new CoverageIntegrationService()
    const result = await service.exportCoverage('jira', {
      recordId: 'record-1',
      generatedAt: '',
      requirements: [
        {
          reqId: 'REQ-001',
          text: '用户可以上传流程图 PDF',
          cases: [{ caseId: 'case-1', title: '上传 PDF 成功' }],
        },
      ],
    })

    expect(result).toEqual({
      provider: 'jira',
      dryRun: true,
      exported: 1,
      writtenBack: 0,
      warnings: [],
    })
  })

  it('rejects unsupported providers before calling external systems', () => {
    const service = new CoverageIntegrationService()

    expect(() => service.normalizeProvider('unknown')).toThrow(BadRequestException)
  })

  it('validates writeback payloads without binding a specific platform api', async () => {
    const service = new CoverageIntegrationService()
    const result = await service.writebackCoverage({
      recordId: 'record-1',
      provider: 'feishu',
      items: [
        {
          reqId: 'REQ-001',
          tpId: 'TP-001',
          status: 'PASSED',
          actualResult: 'playwright passed',
        },
      ],
    })

    expect(result.provider).toBe('feishu')
    expect(result.writtenBack).toBe(1)
  })
})

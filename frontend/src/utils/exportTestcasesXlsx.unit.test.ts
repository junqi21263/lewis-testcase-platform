import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { contractExportCases } from '@/test/fixtures/contracts/export/testcase-export-cases'
import { TESTCASE_EXPORT_COLUMNS_CN } from './testcaseExportFormat'
import { buildTestcasesXlsxExport } from './exportTestcasesXlsx'

async function readWorksheetXml(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const sheet = zip.file('xl/worksheets/sheet1.xml')
  if (!sheet) throw new Error('sheet1.xml missing')
  return sheet.async('string')
}

describe('buildTestcasesXlsxExport', () => {
  it('builds a real .xlsx workbook with the agreed test case columns', async () => {
    const result = await buildTestcasesXlsxExport(contractExportCases, {
      moduleLabel: '支付模块',
      now: new Date('2026-06-10T06:30:00.000Z'),
    })

    expect(result.filename).toBe('20260610_1430.xlsx')
    expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    const xml = await readWorksheetXml(result.blob)

    for (const header of TESTCASE_EXPORT_COLUMNS_CN) {
      expect(xml).toContain(header)
    }
    expect(xml).toContain('支付成功后生成订单')
    expect(xml).toContain('支付')
    expect(xml).toContain('[1] 提交订单')
  })
})

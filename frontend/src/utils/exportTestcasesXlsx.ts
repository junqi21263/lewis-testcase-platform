import type { TestCase } from '@/types'
import {
  TESTCASE_EXPORT_COLUMNS_CN,
  exportFilenameTimestamp,
  testcaseDelimitedValues,
} from '@/utils/testcaseExportFormat'

const TESTCASE_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface BuildTestcasesXlsxExportOptions {
  moduleLabel?: string
  now?: Date
}

export interface TestcasesXlsxExport {
  blob: Blob
  filename: string
  mimeType: string
}

function escapeXml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function columnName(index: number): string {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function worksheetXml(rows: string[][]): string {
  const sheetRows = rows
    .map((row, rowIdx) => {
      const r = rowIdx + 1
      const cells = row
        .map((value, colIdx) => {
          const ref = `${columnName(colIdx)}${r}`
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
        })
        .join('')
      return `<row r="${r}">${cells}</row>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`
}

export async function buildTestcasesXlsxExport(
  cases: TestCase[],
  options: BuildTestcasesXlsxExportOptions = {},
): Promise<TestcasesXlsxExport> {
  const { default: JSZip } = await import('jszip')
  const rows = [
    [...TESTCASE_EXPORT_COLUMNS_CN],
    ...cases.map((c) => testcaseDelimitedValues(c, options.moduleLabel ?? '')),
  ]
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
  )
  zip.folder('_rels')?.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  )
  zip.folder('xl')?.file(
    'workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="测试用例" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
  )
  zip.folder('xl')?.folder('_rels')?.file(
    'workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
  )
  zip.folder('xl')?.folder('worksheets')?.file('sheet1.xml', worksheetXml(rows))
  const content = await zip.generateAsync({
    type: 'arraybuffer',
    mimeType: TESTCASE_XLSX_MIME,
    compression: 'DEFLATE',
  })
  const blob = new Blob([content], { type: TESTCASE_XLSX_MIME })

  return {
    blob,
    filename: `${exportFilenameTimestamp(options.now)}.xlsx`,
    mimeType: TESTCASE_XLSX_MIME,
  }
}

export async function downloadTestcasesXlsx(
  cases: TestCase[],
  options: BuildTestcasesXlsxExportOptions = {},
): Promise<void> {
  const { blob, filename } = await buildTestcasesXlsxExport(cases, options)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  try {
    a.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * 联调自测：不启动 HTTP，直接调用 AnalysisReportPdfService.render
 * 验证含 Mermaid 占位图时的 PDF 生成（需先 pnpm exec prisma generate --schema=./prisma/schema.prod.prisma）。
 *
 * 用法：pnpm exec ts-node -r tsconfig-paths/register scripts/smoke-export-analysis-pdf.ts
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { AnalysisReportPdfService } from '../src/modules/ai/analysis-report-pdf.service'

/** 1×1 透明 PNG（base64，无前缀） */
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function main() {
  const svc = new AnalysisReportPdfService()
  const markdown = [
    '## 5. 业务流程分析',
    '',
    '```mermaid',
    'flowchart LR',
    '  A[开始] --> B[结束]',
    '```',
    '',
  ].join('\n')

  const buf = await svc.render({
    markdown,
    documentTitle: '联调冒烟',
    version: 'V1.0',
    mermaidImagesBase64: [TINY_PNG],
  })

  const magic = buf.slice(0, 4).toString('ascii')
  if (magic !== '%PDF') {
    throw new Error(`期望 PDF 魔数，实际: ${magic}`)
  }

  const out = path.join(os.tmpdir(), `_smoke-analysis-report-${Date.now()}.pdf`)
  fs.writeFileSync(out, buf)
  console.log(`OK: ${buf.length} bytes → ${out}`)

  const plain = await svc.render({
    markdown: '## 测试\n\n普通段落。\n',
    documentTitle: '无图',
  })
  if (plain.slice(0, 4).toString('ascii') !== '%PDF') {
    throw new Error('无 Mermaid 图路径失败')
  }
  console.log(`OK: 纯 Markdown PDF ${plain.length} bytes`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

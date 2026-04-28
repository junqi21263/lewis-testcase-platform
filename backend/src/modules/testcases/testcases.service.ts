import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { ExportFormat, Prisma, TestCaseStatus } from '@prisma/client'
import type { CreateTestCaseDto } from './dto/create-test-case.dto'
import { extractModuleFromTags } from '../ai/parse-loose-ai-output.util'

/** Excel 导出表头顺序（与业务约定一致） */
const EXCEL_CASE_HEADERS = [
  '用例名称',
  '所属模块',
  '标签',
  '前置条件',
  '步骤描述',
  '预期结果',
  '编辑模式',
  '备注',
  '用例等级',
] as const

function excelExportFilenameTimestamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const h = pad(d.getHours())
  const min = pad(d.getMinutes())
  return `${y}${m}${day}_${h}${min}`
}

function formatStepsForExcel(steps: unknown): string {
  if (!Array.isArray(steps)) return ''
  return steps
    .map((s: { order?: number; action?: string; expected?: string }) => {
      const order = typeof s.order === 'number' ? s.order : ''
      const action = s.action ?? ''
      const exp = s.expected?.trim()
      return exp ? `${order}. ${action}（期望：${exp}）` : `${order}. ${action}`
    })
    .join('\n')
}

/** 用例 status → Excel「编辑模式」展示文案 */
function caseStatusToEditModeLabel(status: string): string {
  const m: Record<string, string> = {
    DRAFT: '草稿',
    REVIEWING: '评审中',
    APPROVED: '已通过',
    ARCHIVED: '已归档',
  }
  return m[status] ?? status
}

function tagsCellExcludingModulePrefix(tags: unknown): string {
  if (!Array.isArray(tags)) return ''
  return tags
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .filter((t) => !t.startsWith('模块:'))
    .join(', ')
}

@Injectable()
export class TestcasesService {
  constructor(private prisma: PrismaService) {}

  async getSummary(userId: string) {
    const where = { creatorId: userId }
    const [totalSuites, totalCasesAgg] = await Promise.all([
      this.prisma.testSuite.count({ where }),
      this.prisma.testCase.aggregate({
        where: { suite: { creatorId: userId } },
        _count: { id: true },
      }),
    ])
    return { totalSuites, totalCases: totalCasesAgg._count.id }
  }

  // ---- 用例集 ----

  async getSuites(userId: string, page = 1, pageSize = 10, keyword?: string) {
    const where = {
      creatorId: userId,
      ...(keyword ? { name: { contains: keyword, mode: 'insensitive' as const } } : {}),
    }
    const [list, total] = await Promise.all([
      this.prisma.testSuite.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { cases: true } }, creator: { select: { id: true, username: true } } },
      }),
      this.prisma.testSuite.count({ where }),
    ])
    return {
      list: list.map((s) => ({ ...s, caseCount: s._count.cases, _count: undefined })),
      total, page, pageSize,
    }
  }

  async getSuiteById(id: string) {
    const suite = await this.prisma.testSuite.findUnique({
      where: { id },
      include: { cases: { orderBy: { createdAt: 'asc' } }, creator: { select: { id: true, username: true } } },
    })
    if (!suite) throw new NotFoundException('用例集不存在')
    return suite
  }

  async createSuite(userId: string, data: { name: string; description?: string; projectName?: string }) {
    return this.prisma.testSuite.create({
      data: { ...data, creatorId: userId },
    })
  }

  async updateSuite(id: string, userId: string, data: Partial<{ name: string; description: string; status: TestCaseStatus }>) {
    const suite = await this.prisma.testSuite.findUnique({ where: { id } })
    if (!suite) throw new NotFoundException('用例集不存在')
    if (suite.creatorId !== userId) throw new ForbiddenException('无权修改该用例集')
    return this.prisma.testSuite.update({ where: { id }, data })
  }

  async deleteSuite(id: string, userId: string) {
    const suite = await this.prisma.testSuite.findUnique({ where: { id } })
    if (!suite) throw new NotFoundException('用例集不存在')
    if (suite.creatorId !== userId) throw new ForbiddenException('无权删除该用例集')
    await this.prisma.testSuite.delete({ where: { id } })
  }

  // ---- 用例 ----

  async getCasesBySuiteId(suiteId: string) {
    return this.prisma.testCase.findMany({
      where: { suiteId },
      orderBy: { createdAt: 'asc' },
    })
  }

  async updateCase(id: string, data: any) {
    const c = await this.prisma.testCase.findUnique({ where: { id } })
    if (!c) throw new NotFoundException('用例不存在')
    return this.prisma.testCase.update({ where: { id }, data })
  }

  async deleteCase(id: string) {
    const c = await this.prisma.testCase.findUnique({ where: { id } })
    if (!c) throw new NotFoundException('用例不存在')
    await this.prisma.testCase.delete({ where: { id } })
  }

  async createCase(suiteId: string, userId: string, dto: CreateTestCaseDto) {
    const suite = await this.prisma.testSuite.findUnique({ where: { id: suiteId } })
    if (!suite) throw new NotFoundException('用例集不存在')
    if (suite.creatorId !== userId) throw new ForbiddenException('无权在该用例集下新增用例')

    const steps =
      dto.steps && dto.steps.length > 0
        ? dto.steps.map((s) => ({ order: s.order, action: s.action, expected: s.expected ?? '' }))
        : [{ order: 1, action: '请编辑测试步骤', expected: '' }]

    return this.prisma.testCase.create({
      data: {
        suiteId,
        title: dto.title,
        description: dto.description,
        precondition: dto.precondition,
        expectedResult: dto.expectedResult,
        priority: dto.priority ?? 'P2',
        type: dto.type ?? 'FUNCTIONAL',
        steps: steps as unknown as Prisma.InputJsonValue,
        tags: [],
      },
    })
  }

  // ---- 导出 ----

  async exportSuite(suiteId: string, format: string, userId: string) {
    const suite = await this.getSuiteById(suiteId)
    let content: Buffer
    let filename: string
    let mimeType: string

    switch (format.toUpperCase()) {
      case 'EXCEL':
        ({ content, filename, mimeType } = await this.exportToExcel(suite))
        break
      case 'JSON':
        ({ content, filename, mimeType } = this.exportToJson(suite))
        break
      case 'MARKDOWN':
        ({ content, filename, mimeType } = this.exportToMarkdown(suite))
        break
      default:
        ({ content, filename, mimeType } = this.exportToJson(suite))
    }

    // 记录下载日志
    await this.prisma.downloadRecord.create({
      data: {
        suiteId,
        format: format as ExportFormat,
        downloadUrl: `/downloads/${filename}`,
        downloaderId: userId,
      },
    })

    const genRec = await this.prisma.generationRecord.findFirst({
      where: { suiteId },
    })
    if (genRec) {
      await this.prisma.generationRecordExport.create({
        data: {
          recordId: genRec.id,
          suiteId,
          operatorId: userId,
          format: format.toUpperCase() as ExportFormat,
          fileSize: content.length,
          downloadCount: 1,
          storagePath: `/downloads/${filename}`,
        },
      })
    }

    return { content, filename, mimeType }
  }

  private async exportToExcel(suite: any): Promise<{ content: Buffer; filename: string; mimeType: string }> {
    const XLSX = require('xlsx')
    const moduleLabel = (suite.projectName && String(suite.projectName).trim()) || suite.name || ''

    const data = suite.cases.map((c: any) => {
      const row: Record<(typeof EXCEL_CASE_HEADERS)[number], string> = {
        用例名称: c.title ?? '',
        所属模块: extractModuleFromTags(c.tags) || moduleLabel,
        标签: tagsCellExcludingModulePrefix(c.tags),
        前置条件: c.precondition ?? '',
        步骤描述: formatStepsForExcel(c.steps),
        预期结果: c.expectedResult ?? '',
        编辑模式: caseStatusToEditModeLabel(String(c.status ?? '')),
        备注: c.description ?? '',
        用例等级: String(c.priority ?? ''),
      }
      return row
    })

    const wb = XLSX.utils.book_new()
    const ws =
      data.length > 0
        ? XLSX.utils.json_to_sheet(data, { header: [...EXCEL_CASE_HEADERS] })
        : XLSX.utils.aoa_to_sheet([EXCEL_CASE_HEADERS])
    XLSX.utils.book_append_sheet(wb, ws, '测试用例')
    const content = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const filename = `${excelExportFilenameTimestamp()}.xlsx`
    return { content, filename, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  }

  private exportToJson(suite: any): { content: Buffer; filename: string; mimeType: string } {
    const content = Buffer.from(JSON.stringify(suite, null, 2), 'utf-8')
    return { content, filename: `${suite.name}.json`, mimeType: 'application/json' }
  }

  private exportToMarkdown(suite: any): { content: Buffer; filename: string; mimeType: string } {
    let md = `# ${suite.name}\n\n`
    if (suite.description) md += `> ${suite.description}\n\n`
    suite.cases.forEach((c: any, i: number) => {
      md += `## ${i + 1}. ${c.title}\n\n`
      md += `- **优先级**: ${c.priority}\n`
      md += `- **类型**: ${c.type}\n`
      if (c.precondition) md += `- **前置条件**: ${c.precondition}\n`
      md += `\n**测试步骤**:\n`
      if (Array.isArray(c.steps)) {
        c.steps.forEach((s: any) => { md += `${s.order}. ${s.action}\n` })
      }
      md += `\n**预期结果**: ${c.expectedResult}\n\n---\n\n`
    })
    return { content: Buffer.from(md, 'utf-8'), filename: `${suite.name}.md`, mimeType: 'text/markdown' }
  }
}

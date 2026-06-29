import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { ExportFormat, Prisma, TestCaseStatus } from '@prisma/client'
import type { CreateTestCaseDto } from './dto/create-test-case.dto'
import type { CreateSuiteDto, UpdateSuiteDto, UpdateTestCaseDto } from './dto/testcase-update.dto'
import { extractModuleFromTags } from '../ai/parse-loose-ai-output.util'
import { filterPromptInstructionArtifactCases } from '../ai/case-row-normalize.util'

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
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${value('year')}${value('month')}${value('day')}_${value('hour')}${value('minute')}`
}

function formatStepsForExcel(steps: unknown): string {
  if (!Array.isArray(steps)) return ''
  return steps
    .map((s: { order?: number; action?: string; expected?: string }) => {
      const order = typeof s.order === 'number' ? s.order : ''
      const action = s.action ?? ''
      const exp = s.expected?.trim()
      return exp ? `[${order}] ${action}（期望：${exp}）` : `[${order}] ${action}`
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

  private sanitizeSuiteCases<T extends { cases: any[] }>(suite: T): T {
    return {
      ...suite,
      cases: filterPromptInstructionArtifactCases(suite.cases ?? []),
    }
  }

  private async getOwnedSuiteOrThrow(id: string, userId: string) {
    const suite = await this.prisma.testSuite.findFirst({
      where: { id, creatorId: userId },
      include: { cases: { orderBy: { createdAt: 'asc' } }, creator: { select: { id: true, username: true } } },
    })
    if (!suite) throw new NotFoundException('用例集不存在')
    return suite
  }

  private async getOwnedCaseOrThrow(id: string, userId: string) {
    const c = await this.prisma.testCase.findFirst({
      where: { id, suite: { creatorId: userId } },
    })
    if (!c) throw new NotFoundException('用例不存在')
    return c
  }

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
    const p = Math.max(1, Number(page) || 1)
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 10))
    const where = {
      creatorId: userId,
      ...(keyword ? { name: { contains: keyword, mode: 'insensitive' as const } } : {}),
    }
    const [list, total] = await Promise.all([
      this.prisma.testSuite.findMany({
        where,
        skip: (p - 1) * ps,
        take: ps,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { cases: true } }, creator: { select: { id: true, username: true } } },
      }),
      this.prisma.testSuite.count({ where }),
    ])
    return {
      list: list.map((s) => ({ ...s, caseCount: s._count.cases, _count: undefined })),
      total, page: p, pageSize: ps,
    }
  }

  async getSuiteById(id: string, userId: string) {
    const suite = await this.getOwnedSuiteOrThrow(id, userId)
    return this.sanitizeSuiteCases(suite)
  }

  async createSuite(userId: string, data: CreateSuiteDto) {
    return this.prisma.testSuite.create({
      data: { ...data, creatorId: userId },
    })
  }

  async updateSuite(id: string, userId: string, data: UpdateSuiteDto) {
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

  async getCasesBySuiteId(suiteId: string, userId: string) {
    await this.getOwnedSuiteOrThrow(suiteId, userId)
    const cases = await this.prisma.testCase.findMany({
      where: { suiteId },
      orderBy: { createdAt: 'asc' },
    })
    return filterPromptInstructionArtifactCases(cases)
  }

  async updateCase(id: string, userId: string, data: UpdateTestCaseDto) {
    await this.getOwnedCaseOrThrow(id, userId)
    const { steps, automationReadiness, ...rest } = data
    const patch: Prisma.TestCaseUpdateInput = {
      ...rest,
      ...(steps ? { steps: steps as unknown as Prisma.InputJsonValue } : {}),
      ...(automationReadiness
        ? { automationReadiness: automationReadiness as Prisma.InputJsonValue }
        : {}),
    }
    return this.prisma.testCase.update({ where: { id }, data: patch })
  }

  async deleteCase(id: string, userId: string) {
    await this.getOwnedCaseOrThrow(id, userId)
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
    const normalizedFormat = format.toUpperCase()
    const allowed: ExportFormat[] = ['EXCEL', 'JSON', 'MARKDOWN']
    if (!allowed.includes(normalizedFormat as ExportFormat)) {
      throw new BadRequestException('不支持的导出格式')
    }
    const suite = this.sanitizeSuiteCases(await this.getOwnedSuiteOrThrow(suiteId, userId))
    let content: Buffer
    let filename: string
    let mimeType: string

    switch (normalizedFormat) {
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
        throw new BadRequestException('不支持的导出格式')
    }

    // 记录下载日志
    await this.prisma.downloadRecord.create({
      data: {
        suiteId,
        format: normalizedFormat as ExportFormat,
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
          format: normalizedFormat as ExportFormat,
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
        c.steps.forEach((s: any) => { md += `[${s.order}] ${s.action}\n` })
      }
      md += `\n**预期结果**: ${c.expectedResult}\n\n---\n\n`
    })
    return { content: Buffer.from(md, 'utf-8'), filename: `${suite.name}.md`, mimeType: 'text/markdown' }
  }
}

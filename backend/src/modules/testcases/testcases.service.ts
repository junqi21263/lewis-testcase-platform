import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { ExportFormat, Prisma, TestCaseStatus } from '@prisma/client'
import type { CreateTestCaseDto } from './dto/create-test-case.dto'

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
    const data = suite.cases.map((c: any, i: number) => ({
      序号: i + 1,
      标题: c.title,
      优先级: c.priority,
      类型: c.type,
      前置条件: c.precondition || '',
      测试步骤: Array.isArray(c.steps) ? c.steps.map((s: any) => `${s.order}. ${s.action}`).join('\n') : '',
      预期结果: c.expectedResult,
      状态: c.status,
    }))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data)
    XLSX.utils.book_append_sheet(wb, ws, '测试用例')
    const content = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    return { content, filename: `${suite.name}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
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

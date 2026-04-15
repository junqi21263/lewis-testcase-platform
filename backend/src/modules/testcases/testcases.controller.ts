import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Res } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { Response } from 'express'
import { TestcasesService } from './testcases.service'
import { CurrentUser } from '@/common/decorators/current-user.decorator'

@ApiTags('测试用例')
@ApiBearerAuth()
@Controller('testcases')
export class TestcasesController {
  constructor(private service: TestcasesService) {}

  // ---- 用例集 ----
  @Get('summary')
  @ApiOperation({ summary: '工作台：用例数据汇总' })
  getSummary(@CurrentUser('id') userId: string) {
    return this.service.getSummary(userId)
  }

  @Get('suites')
  @ApiOperation({ summary: '获取用例集列表' })
  getSuites(
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('keyword') keyword?: string,
  ) {
    return this.service.getSuites(userId, +page, +pageSize, keyword)
  }

  @Get('suites/:id')
  @ApiOperation({ summary: '获取用例集详情' })
  getSuiteById(@Param('id') id: string) {
    return this.service.getSuiteById(id)
  }

  @Post('suites')
  @ApiOperation({ summary: '创建用例集' })
  createSuite(@CurrentUser('id') userId: string, @Body() data: any) {
    return this.service.createSuite(userId, data)
  }

  @Patch('suites/:id')
  @ApiOperation({ summary: '更新用例集' })
  updateSuite(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() data: any) {
    return this.service.updateSuite(id, userId, data)
  }

  @Delete('suites/:id')
  @ApiOperation({ summary: '删除用例集' })
  deleteSuite(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.deleteSuite(id, userId)
  }

  // ---- 用例 ----
  @Get('suites/:id/cases')
  @ApiOperation({ summary: '获取用例集下的所有用例' })
  getCases(@Param('id') suiteId: string) {
    return this.service.getCasesBySuiteId(suiteId)
  }

  @Patch('cases/:id')
  @ApiOperation({ summary: '更新用例' })
  updateCase(@Param('id') id: string, @Body() data: any) {
    return this.service.updateCase(id, data)
  }

  @Delete('cases/:id')
  @ApiOperation({ summary: '删除用例' })
  deleteCase(@Param('id') id: string) {
    return this.service.deleteCase(id)
  }

  // ---- 导出 ----
  @Get('suites/:id/export')
  @ApiOperation({ summary: '导出用例集' })
  async exportSuite(
    @Param('id') suiteId: string,
    @Query('format') format = 'EXCEL',
    @CurrentUser('id') userId: string,
    @Res() res: Response,
  ) {
    const { content, filename, mimeType } = await this.service.exportSuite(suiteId, format, userId)
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.setHeader('Content-Type', mimeType)
    res.send(content)
  }
}

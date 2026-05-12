import { Controller, Get, Query, Res } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { UsageService } from './usage.service'

@ApiTags('多模态用量统计')
@ApiBearerAuth()
@Controller('usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get('summary')
  @ApiOperation({ summary: '多模态用量汇总（今日/本月）' })
  summary(@CurrentUser('id') userId: string) {
    return this.usage.summary(userId)
  }

  @Get('details')
  @ApiOperation({ summary: '多模态用量明细分页' })
  details(
    @CurrentUser('id') userId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.usage.details(userId, Number(page), Number(pageSize))
  }

  @Get('export.csv')
  @ApiOperation({ summary: '导出多模态用量 CSV' })
  async exportCsv(@CurrentUser('id') userId: string, @Res({ passthrough: false }) res: Response) {
    const csv = await this.usage.exportCsv(userId)
    const filename = `multimodal-usage-${new Date().toISOString().slice(0, 10)}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.send(csv)
  }
}

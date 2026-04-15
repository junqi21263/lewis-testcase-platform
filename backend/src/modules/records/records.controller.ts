import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  Patch,
  Body,
  Post,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { RecordsService, type RecordsListParams } from './records.service'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { BatchRecordsDto } from './dto/batch-records.dto'
import { PatchRecordDto } from './dto/patch-record.dto'

@ApiTags('生成记录')
@ApiBearerAuth()
@Controller('records')
export class RecordsController {
  constructor(private service: RecordsService) {}

  @Get('summary')
  @ApiOperation({ summary: '工作台：生成记录汇总（不含回收站）' })
  getSummary(@CurrentUser('id') userId: string) {
    return this.service.getSummary(userId)
  }

  @Get('meta/models')
  @ApiOperation({ summary: '当前用户已使用过的模型列表（筛选用）' })
  getModels(@CurrentUser('id') userId: string) {
    return this.service.getDistinctModels(userId)
  }

  @Get('meta/ids')
  @ApiOperation({ summary: '与列表相同筛选条件下的记录 id（最多500条，用于全选）' })
  getMatchingIds(@CurrentUser('id') userId: string, @Query() q: RecordsListParams) {
    return this.service.getMatchingIds(userId, q)
  }

  @Post('batch')
  @ApiOperation({ summary: '批量操作' })
  batch(@CurrentUser('id') userId: string, @Body() dto: BatchRecordsDto) {
    return this.service.batch(userId, dto.ids, dto.action)
  }

  @Get()
  @ApiOperation({ summary: '获取生成记录列表' })
  getList(@CurrentUser('id') userId: string, @Query() q: RecordsListParams) {
    return this.service.getRecords(userId, q)
  }

  @Get(':id')
  @ApiOperation({ summary: '获取记录详情' })
  getById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.getById(id, userId)
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新记录（如归档状态）' })
  patch(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: PatchRecordDto,
  ) {
    return this.service.patch(id, userId, dto)
  }

  @Post(':id/restore')
  @ApiOperation({ summary: '从回收站恢复' })
  restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.restore(id, userId)
  }

  @Delete(':id/hard')
  @ApiOperation({ summary: '彻底删除（仅回收站中）' })
  hardDelete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.permanentDelete(id, userId)
  }

  @Delete(':id')
  @ApiOperation({ summary: '移入回收站（软删除）' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.softDelete(id, userId)
  }
}

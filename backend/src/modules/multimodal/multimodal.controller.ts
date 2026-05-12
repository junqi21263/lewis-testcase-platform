import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Roles } from '@/common/decorators/roles.decorator'
import { MultimodalService } from './multimodal.service'
import { UpdateRuntimeConfigDto } from './dto/update-runtime-config.dto'
import { CreateBatchTaskDto } from './dto/create-batch-task.dto'

@ApiTags('多模态')
@ApiBearerAuth()
@Controller('multimodal')
export class MultimodalController {
  constructor(private readonly multimodal: MultimodalService) {}

  @Get('runtime-config')
  @ApiOperation({ summary: '获取多模态运行时配置' })
  getRuntimeConfig() {
    return this.multimodal.getRuntimeConfig()
  }

  @Patch('runtime-config')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '更新多模态运行时配置（实时生效）' })
  updateRuntimeConfig(@Body() dto: UpdateRuntimeConfigDto) {
    return this.multimodal.upsertRuntimeConfig(dto)
  }

  @Delete('cache')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '清空全部多模态缓存' })
  clearAllCache() {
    return this.multimodal.clearCache()
  }

  @Delete('cache/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '删除单条多模态缓存' })
  clearCacheById(@Param('id') id: string) {
    return this.multimodal.clearCache(id)
  }

  @Post('batch-tasks')
  @ApiOperation({ summary: '创建批处理任务（最多20文件）' })
  createBatchTask(@Body() dto: CreateBatchTaskDto, @CurrentUser('id') userId: string) {
    return this.multimodal.createBatchTask({
      title: dto.title,
      moduleType: dto.moduleType,
      creatorId: userId,
      files: dto.files,
    })
  }

  @Get('batch-tasks')
  @ApiOperation({ summary: '批处理任务列表（当前用户）' })
  listBatchTasks(@CurrentUser('id') userId: string) {
    return this.multimodal.listBatchTasks(userId)
  }

  @Post('batch-tasks/:id/state')
  @ApiOperation({ summary: '批任务状态流转（pause/resume/cancel）' })
  updateBatchTaskState(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('action') action: 'pause' | 'resume' | 'cancel',
  ) {
    return this.multimodal.updateBatchTaskState(userId, id, action)
  }
}

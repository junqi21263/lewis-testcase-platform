import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { SettingsService } from './settings.service'
import { CreateAiModelSettingsDto, UpdateAiModelSettingsDto } from './dto/ai-model-settings.dto'
import { Roles } from '@/common/decorators/roles.decorator'
@ApiTags('系统设置')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get('runtime')
  @ApiOperation({ summary: '运行参数提示（上传上限、限流等，来自环境变量）' })
  getRuntime() {
    return this.settingsService.getRuntimeHints()
  }

  @Get('models')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '管理员：列出全部 AI 模型配置（不含 API Key）' })
  listModelsAdmin() {
    return this.settingsService.listAiModelsAdmin()
  }

  @Post('models')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '管理员：新增 AI 模型配置' })
  createModel(@Body() dto: CreateAiModelSettingsDto) {
    return this.settingsService.createAiModel(dto)
  }

  @Patch('models/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '管理员：更新 AI 模型配置' })
  updateModel(@Param('id') id: string, @Body() dto: UpdateAiModelSettingsDto) {
    return this.settingsService.updateAiModel(id, dto)
  }

  @Post('models/:id/archive')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '管理员：归档模型（停用，不参与生成）' })
  archiveModel(@Param('id') id: string) {
    return this.settingsService.archiveAiModel(id)
  }

  @Post('models/:id/set-default')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '管理员：设为默认模型' })
  setDefault(@Param('id') id: string) {
    return this.settingsService.setDefaultAiModel(id)
  }
}

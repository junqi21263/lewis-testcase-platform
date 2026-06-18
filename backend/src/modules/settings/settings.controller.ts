import { Body, Controller, Delete, Get, Ip, Param, Patch, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { SettingsService } from './settings.service'
import { CreateAiModelSettingsDto, UpdateAiModelSettingsDto } from './dto/ai-model-settings.dto'
import { Roles } from '@/common/decorators/roles.decorator'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { UpdateRuntimeConfigDto } from '@/modules/multimodal/dto/update-runtime-config.dto'
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

  @Get('multimodal-config')
  @ApiOperation({ summary: '多模态系统配置（实时）' })
  getMultimodalConfig() {
    return this.settingsService.getMultimodalConfig()
  }

  @Patch('multimodal-config')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '管理员：更新多模态系统配置（实时生效）' })
  updateMultimodalConfig(@Body() dto: UpdateRuntimeConfigDto, @CurrentUser('id') operatorId: string, @Ip() ip: string) {
    return this.settingsService.updateMultimodalConfig(dto, operatorId, ip)
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
  createModel(@Body() dto: CreateAiModelSettingsDto, @CurrentUser('id') operatorId: string, @Ip() ip: string) {
    return this.settingsService.createAiModel(dto, operatorId, ip)
  }

  @Patch('models/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '管理员：更新 AI 模型配置' })
  updateModel(
    @Param('id') id: string,
    @Body() dto: UpdateAiModelSettingsDto,
    @CurrentUser('id') operatorId: string,
    @Ip() ip: string,
  ) {
    return this.settingsService.updateAiModel(id, dto, operatorId, ip)
  }

  @Post('models/:id/archive')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '管理员：归档模型（停用，不参与生成）' })
  archiveModel(@Param('id') id: string, @CurrentUser('id') operatorId: string, @Ip() ip: string) {
    return this.settingsService.archiveAiModel(id, operatorId, ip)
  }

  @Delete('models/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '管理员：删除 AI 模型配置' })
  deleteModel(@Param('id') id: string, @CurrentUser('id') operatorId: string, @Ip() ip: string) {
    return this.settingsService.deleteAiModel(id, operatorId, ip)
  }

  @Post('models/:id/set-default')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '管理员：设为默认模型' })
  setDefault(@Param('id') id: string, @CurrentUser('id') operatorId: string, @Ip() ip: string) {
    return this.settingsService.setDefaultAiModel(id, operatorId, ip)
  }
}

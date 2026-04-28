import { Body, Controller, Get, Patch } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { PreferencesService } from './preferences.service'
import { UpdatePreferencesDto } from './dto/update-preferences.dto'

@ApiTags('用户偏好')
@ApiBearerAuth()
@Controller('preferences')
export class PreferencesController {
  constructor(private prefs: PreferencesService) {}

  @Get('me')
  @ApiOperation({ summary: '获取当前用户偏好（不存在则创建默认值）' })
  getMyPrefs(@CurrentUser('id') userId: string) {
    return this.prefs.getOrCreate(userId)
  }

  @Patch('me')
  @ApiOperation({ summary: '更新当前用户偏好' })
  updateMyPrefs(@CurrentUser('id') userId: string, @Body() dto: UpdatePreferencesDto) {
    return this.prefs.update(userId, dto)
  }
}


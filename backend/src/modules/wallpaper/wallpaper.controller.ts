import { Controller, Get, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { WallpaperService } from './wallpaper.service'

@ApiTags('壁纸')
@ApiBearerAuth()
@Controller('wallpaper')
export class WallpaperController {
  constructor(private wallpaper: WallpaperService) {}

  @Get('next')
  @ApiOperation({ summary: '获取下一张背景壁纸（支持 force=1 强制换一张）' })
  getNext(
    @CurrentUser('id') userId: string,
    @Query('force') force?: string,
  ) {
    return this.wallpaper.getNextForUser(userId, { force: force === '1' || force === 'true' })
  }
}


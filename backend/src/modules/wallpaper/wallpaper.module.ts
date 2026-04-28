import { Module } from '@nestjs/common'
import { PreferencesModule } from '@/modules/preferences/preferences.module'
import { WallpaperController } from './wallpaper.controller'
import { WallpaperService } from './wallpaper.service'

@Module({
  imports: [PreferencesModule],
  controllers: [WallpaperController],
  providers: [WallpaperService],
})
export class WallpaperModule {}


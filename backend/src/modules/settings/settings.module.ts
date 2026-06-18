import { Module } from '@nestjs/common'
import { SettingsController } from './settings.controller'
import { SettingsService } from './settings.service'
import { MultimodalModule } from '@/modules/multimodal/multimodal.module'
import { RedisModule } from '@/redis/redis.module'

@Module({
  imports: [MultimodalModule, RedisModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}

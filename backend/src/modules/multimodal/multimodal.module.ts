import { Module } from '@nestjs/common'
import { MultimodalService } from './multimodal.service'
import { MultimodalController } from './multimodal.controller'
import { CosStorageService } from '@/modules/files/cos-storage.service'

@Module({
  controllers: [MultimodalController],
  providers: [MultimodalService, CosStorageService],
  exports: [MultimodalService],
})
export class MultimodalModule {}

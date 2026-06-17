import { Module } from '@nestjs/common'
import { ImagePreprocessService } from './image-preprocess.service'
import { OcrCacheService } from './ocr-cache.service'
import { OcrEngineService } from './ocr-engine.service'
import { OcrQueueService } from './ocr-queue.service'
import { TencentOcrClientService } from './tencent-ocr.client.service'
import { ImageOcrPipelineService } from './image-ocr-pipeline.service'
import { OcrTaskService } from './ocr-task.service'
import { OcrController } from './ocr.controller'
import { RedisModule } from '@/redis/redis.module'

@Module({
  imports: [RedisModule],
  controllers: [OcrController],
  providers: [
    ImagePreprocessService,
    OcrCacheService,
    OcrEngineService,
    OcrQueueService,
    TencentOcrClientService,
    ImageOcrPipelineService,
    OcrTaskService,
  ],
  exports: [
    ImageOcrPipelineService,
    OcrCacheService,
    OcrEngineService,
    ImagePreprocessService,
    TencentOcrClientService,
  ],
})
export class OcrModule {}

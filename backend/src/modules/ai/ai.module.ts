import { Module } from '@nestjs/common'
import { AiService } from './ai.service'
import { AiController } from './ai.controller'
import { AnalysisReportPdfService } from './analysis-report-pdf.service'
import { AiRuntimeQueueService } from './ai-runtime-queue.service'
import { AiStreamRecoveryService } from './ai-stream-recovery.service'
import { AiStructuredOutputService } from './ai-structured-output.service'
import { MultimodalModule } from '@/modules/multimodal/multimodal.module'
import { ReviewsModule } from '@/modules/reviews/reviews.module'
import { RedisModule } from '@/redis/redis.module'

@Module({
  imports: [MultimodalModule, ReviewsModule, RedisModule],
  providers: [AiService, AnalysisReportPdfService, AiRuntimeQueueService, AiStreamRecoveryService, AiStructuredOutputService],
  controllers: [AiController],
  exports: [AiService, AnalysisReportPdfService, AiRuntimeQueueService, AiStreamRecoveryService, AiStructuredOutputService],
})
export class AiModule {}

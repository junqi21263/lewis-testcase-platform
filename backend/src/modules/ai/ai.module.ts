import { Module } from '@nestjs/common'
import { AiService } from './ai.service'
import { AiController } from './ai.controller'
import { AnalysisReportPdfService } from './analysis-report-pdf.service'
import { MultimodalModule } from '@/modules/multimodal/multimodal.module'

@Module({
  imports: [MultimodalModule],
  providers: [AiService, AnalysisReportPdfService],
  controllers: [AiController],
  exports: [AiService, AnalysisReportPdfService],
})
export class AiModule {}

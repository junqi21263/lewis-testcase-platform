import { Module } from '@nestjs/common'
import { AiService } from './ai.service'
import { AiController } from './ai.controller'
import { AnalysisReportPdfService } from './analysis-report-pdf.service'

@Module({
  providers: [AiService, AnalysisReportPdfService],
  controllers: [AiController],
  exports: [AiService, AnalysisReportPdfService],
})
export class AiModule {}

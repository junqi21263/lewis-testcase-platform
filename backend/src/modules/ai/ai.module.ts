import { Module } from '@nestjs/common'
import { AiService } from './ai.service'
import { AiController } from './ai.controller'
import { AnalysisReportPdfService } from './analysis-report-pdf.service'

@Module({
  imports: [],
  providers: [AiService, AnalysisReportPdfService],
  controllers: [AiController],
  exports: [AiService, AnalysisReportPdfService],
})
export class AiModule {}

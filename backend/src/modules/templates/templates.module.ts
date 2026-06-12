import { Module } from '@nestjs/common'
import { TemplatesService } from './templates.service'
import { TemplatesController } from './templates.controller'
import { AiModule } from '@/modules/ai/ai.module'
import { TemplateEvaluationJobsService } from './template-evaluation-jobs.service'

@Module({
  imports: [AiModule],
  providers: [TemplatesService, TemplateEvaluationJobsService],
  controllers: [TemplatesController],
})
export class TemplatesModule {}

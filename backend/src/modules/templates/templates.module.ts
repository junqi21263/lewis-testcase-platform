import { Module } from '@nestjs/common'
import { TemplatesService } from './templates.service'
import { TemplatesController } from './templates.controller'
import { AiModule } from '@/modules/ai/ai.module'

@Module({
  imports: [AiModule],
  providers: [TemplatesService],
  controllers: [TemplatesController],
})
export class TemplatesModule {}

import { Module } from '@nestjs/common'
import { AiService } from './ai.service'
import { AiController } from './ai.controller'
import { PromptBuilderService } from './prompt-builder.service'

@Module({
  providers: [AiService, PromptBuilderService],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}

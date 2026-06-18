import { Module } from '@nestjs/common'
import { CoverageIntegrationService } from './coverage-integration.service'

@Module({
  providers: [CoverageIntegrationService],
  exports: [CoverageIntegrationService],
})
export class IntegrationsModule {}

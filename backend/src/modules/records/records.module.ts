import { Module } from '@nestjs/common'
import { RecordsService } from './records.service'
import { RecordsController } from './records.controller'
import { RecordsCronService } from './records-cron.service'
import { TestcasesModule } from '@/modules/testcases/testcases.module'

@Module({
  imports: [TestcasesModule],
  providers: [RecordsService, RecordsCronService],
  controllers: [RecordsController],
})
export class RecordsModule {}

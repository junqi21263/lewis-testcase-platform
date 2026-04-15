import { Module } from '@nestjs/common'
import { TestcasesService } from './testcases.service'
import { TestcasesController } from './testcases.controller'

@Module({
  providers: [TestcasesService],
  controllers: [TestcasesController],
  exports: [TestcasesService],
})
export class TestcasesModule {}

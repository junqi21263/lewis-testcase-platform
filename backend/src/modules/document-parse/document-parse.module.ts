import { Module } from '@nestjs/common'
import { DocumentParseService } from './document-parse.service'
import { DocumentParseController } from './document-parse.controller'

@Module({
  controllers: [DocumentParseController],
  providers: [DocumentParseService],
})
export class DocumentParseModule {}

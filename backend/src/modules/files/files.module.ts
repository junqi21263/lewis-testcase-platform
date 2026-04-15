import { Module } from '@nestjs/common'
import { FilesService } from './files.service'
import { FilesController } from './files.controller'
import { DocumentVisionService } from './document-vision.service'

@Module({
  providers: [FilesService, DocumentVisionService],
  controllers: [FilesController],
  exports: [FilesService],
})
export class FilesModule {}

import { Module } from '@nestjs/common'
import { FilesService } from './files.service'
import { FilesController } from './files.controller'
import { DocumentVisionService } from './document-vision.service'
import { RequirementStructureService } from './requirement-structure.service'

@Module({
  providers: [FilesService, DocumentVisionService, RequirementStructureService],
  controllers: [FilesController],
  exports: [FilesService],
})
export class FilesModule {}

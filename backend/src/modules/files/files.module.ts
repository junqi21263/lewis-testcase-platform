import { Module } from '@nestjs/common'
import { FilesService } from './files.service'
import { FilesController } from './files.controller'
import { DocumentVisionService } from './document-vision.service'
import { RequirementStructureService } from './requirement-structure.service'
import { LightweightCloudCleanupService } from './lightweight-cloud-cleanup.service'

@Module({
  providers: [
    FilesService,
    DocumentVisionService,
    RequirementStructureService,
    LightweightCloudCleanupService,
  ],
  controllers: [FilesController],
  exports: [FilesService],
})
export class FilesModule {}

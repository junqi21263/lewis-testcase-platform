import { Module } from '@nestjs/common'
import { FilesService } from './files.service'
import { FilesController } from './files.controller'
import { DocumentVisionService } from './document-vision.service'
import { RequirementStructureService } from './requirement-structure.service'
import { LightweightCloudCleanupService } from './lightweight-cloud-cleanup.service'
import { CosStorageService } from './cos-storage.service'
import { PdfDocumentParseService } from './pdf-document-parse.service'
import { TencentOcrSdkPdfService } from './tencent-ocr-sdk-pdf.service'
import { OcrModule } from '@/modules/ocr/ocr.module'

@Module({
  imports: [OcrModule],
  providers: [
    FilesService,
    PdfDocumentParseService,
    TencentOcrSdkPdfService,
    DocumentVisionService,
    RequirementStructureService,
    LightweightCloudCleanupService,
    CosStorageService,
  ],
  controllers: [FilesController],
  exports: [FilesService],
})
export class FilesModule {}

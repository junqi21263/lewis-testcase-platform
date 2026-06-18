import { Module } from '@nestjs/common'
import { FilesService } from './files.service'
import { FilesController } from './files.controller'
import { DocumentVisionService } from './document-vision.service'
import { RequirementStructureService } from './requirement-structure.service'
import { LightweightCloudCleanupService } from './lightweight-cloud-cleanup.service'
import { CosStorageService } from './cos-storage.service'
import { PdfDocumentParseService } from './pdf-document-parse.service'
import { PdfFlowchartParseService } from './pdf-flowchart-parse.service'
import { FileParseRuntimeService } from './file-parse-runtime.service'
import { TencentOcrSdkPdfService } from './tencent-ocr-sdk-pdf.service'
import { OcrModule } from '@/modules/ocr/ocr.module'
import { MultimodalModule } from '@/modules/multimodal/multimodal.module'
import { RedisModule } from '@/redis/redis.module'

@Module({
  imports: [OcrModule, MultimodalModule, RedisModule],
  providers: [
    FilesService,
    PdfDocumentParseService,
    PdfFlowchartParseService,
    TencentOcrSdkPdfService,
    DocumentVisionService,
    RequirementStructureService,
    FileParseRuntimeService,
    LightweightCloudCleanupService,
    CosStorageService,
  ],
  controllers: [FilesController],
  exports: [FilesService, CosStorageService, PdfFlowchartParseService, FileParseRuntimeService],
})
export class FilesModule {}

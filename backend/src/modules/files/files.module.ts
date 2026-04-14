import { Module } from '@nestjs/common'
import { FilesService } from './files.service'
import { FilesController } from './files.controller'
import { CosService } from './cos.service'

@Module({
  providers: [FilesService, CosService],
  controllers: [FilesController],
  exports: [FilesService],
})
export class FilesModule {}

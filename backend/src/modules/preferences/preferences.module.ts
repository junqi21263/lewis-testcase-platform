import { Module } from '@nestjs/common'
import { PrismaModule } from '@/prisma/prisma.module'
import { PreferencesController } from './preferences.controller'
import { PreferencesService } from './preferences.service'

@Module({
  imports: [PrismaModule],
  controllers: [PreferencesController],
  providers: [PreferencesService],
  exports: [PreferencesService],
})
export class PreferencesModule {}


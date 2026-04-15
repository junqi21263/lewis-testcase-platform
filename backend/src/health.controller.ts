import { Controller, Get } from '@nestjs/common'
import { Public } from './common/decorators/public.decorator'
import { PrismaService } from './prisma/prisma.service'
import { ConfigService } from '@nestjs/config'
import { FileStatus } from '@prisma/client'

@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  @Public()
  @Get()
  async getHealth() {
    const workerEnabled = this.config.get<string>('FILE_PARSE_WORKER_ENABLED') !== '0'
    const pending = await this.prisma.uploadedFile.count({ where: { status: FileStatus.PENDING } })
    const parsing = await this.prisma.uploadedFile.count({ where: { status: FileStatus.PARSING } })
    return { status: 'ok', workerEnabled, pending, parsing }
  }
}

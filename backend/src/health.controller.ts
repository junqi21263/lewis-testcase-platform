import { Controller, Get } from '@nestjs/common'
import { Public } from './common/decorators/public.decorator'
import { PrismaService } from './prisma/prisma.service'
import { ConfigService } from '@nestjs/config'
import { FileStatus } from '@prisma/client'
import { CosStorageService } from './modules/files/cos-storage.service'

@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private cosStorage: CosStorageService,
  ) {}

  @Public()
  @Get()
  async getHealth() {
    const workerEnabled = this.config.get<string>('FILE_PARSE_WORKER_ENABLED') !== '0'
    const pending = await this.prisma.uploadedFile.count({ where: { status: FileStatus.PENDING } })
    const parsing = await this.prisma.uploadedFile.count({ where: { status: FileStatus.PARSING } })
    return { status: 'ok', workerEnabled, pending, parsing }
  }

  /** 诊断 COS 密钥/桶/地域（不返回密钥；可 GET /api/health/cos） */
  @Public()
  @Get('cos')
  async getCosHealth() {
    const summary = this.cosStorage.getPublicConfigSummary()
    const uploadStorage = this.config.get<string>('FILE_UPLOAD_STORAGE')?.trim() || 'cos'
    const cached = this.cosStorage.getLastProbe()
    const probe =
      summary.configured && uploadStorage !== 'local'
        ? await this.cosStorage.probePutAccess()
        : {
            ok: false,
            error: 'COS 未启用或 FILE_UPLOAD_STORAGE=local',
            bucket: summary.bucket,
            region: summary.region,
            secretIdSuffix: summary.secretIdSuffix,
          }
    return {
      uploadStorage,
      ...summary,
      probeOk: probe.ok,
      probeError: probe.error ?? null,
      probedAt: cached?.at ?? new Date().toISOString(),
    }
  }
}

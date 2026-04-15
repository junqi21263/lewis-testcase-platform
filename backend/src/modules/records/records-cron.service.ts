import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '@/prisma/prisma.service'
import { GenerationStatus } from '@prisma/client'

/**
 * 生成记录维护任务：回收站清理、过期分享、可选闲置归档（需环境变量显式开启）。
 */
@Injectable()
export class RecordsCronService {
  private readonly logger = new Logger(RecordsCronService.name)

  constructor(private prisma: PrismaService) {}

  /** 每天 01:00 清理回收站超过 30 天的记录（物理删除） */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async purgeRecycledRecords() {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const r = await this.prisma.generationRecord.deleteMany({
      where: {
        deletedAt: { lte: cutoff },
        isDeleted: true,
      },
    })
    if (r.count > 0) {
      this.logger.log(`回收站清理：物理删除 ${r.count} 条生成记录`)
    }
  }

  /** 每天 02:00 将已过期的分享标记为 revoked */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async revokeExpiredShares() {
    const r = await this.prisma.generationRecordShare.updateMany({
      where: {
        revoked: false,
        expiresAt: { lt: new Date() },
      },
      data: { revoked: true },
    })
    if (r.count > 0) {
      this.logger.log(`分享失效：标记 ${r.count} 条`)
    }
  }

  /**
   * 每天 03:00：若设置 AUTO_ARCHIVE_IDLE_DAYS（>=30），将长期未更新的成功记录标为归档。
   * 影响全库符合条件记录，生产环境请评估后再开启。
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async archiveIdleSuccessRecords() {
    const days = parseInt(process.env.AUTO_ARCHIVE_IDLE_DAYS ?? '0', 10)
    if (!days || days < 30) return

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    const r = await this.prisma.generationRecord.updateMany({
      where: {
        deletedAt: null,
        status: GenerationStatus.SUCCESS,
        updatedAt: { lt: cutoff },
      },
      data: { status: GenerationStatus.ARCHIVED },
    })
    if (r.count > 0) {
      this.logger.warn(
        `闲置归档（AUTO_ARCHIVE_IDLE_DAYS=${days}）：已归档 ${r.count} 条 SUCCESS 记录`,
      )
    }
  }
}

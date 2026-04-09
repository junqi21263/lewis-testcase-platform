import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
    })
  }

  async onModuleInit() {
    await this.$connect()
    this.logger.log('数据库连接成功')
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}

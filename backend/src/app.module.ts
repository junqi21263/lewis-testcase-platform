import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'

// 公共模块
import { PrismaModule } from './prisma/prisma.module'
import { HttpExceptionFilter, AllExceptionsFilter } from './common/filters/http-exception.filter'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { RolesGuard } from './common/guards/roles.guard'
import { HealthController } from './health.controller'
import { MiddlewareConfiguration } from './common/middleware/configuration'
import { RateLimitGuard } from './common/guards/rate-limit.guard'

// 业务模块
import { AuthModule } from './modules/auth/auth.module'
import { FilesModule } from './modules/files/files.module'
import { AiModule } from './modules/ai/ai.module'
import { TestcasesModule } from './modules/testcases/testcases.module'
import { TemplatesModule } from './modules/templates/templates.module'
import { TeamsModule } from './modules/teams/teams.module'
import { RecordsModule } from './modules/records/records.module'
import { SettingsModule } from './modules/settings/settings.module'
import { MailModule } from './modules/mail/mail.module'

@Module({
  controllers: [HealthController],
  imports: [
    // 环境变量配置（全局）。生产不读磁盘 .env，仅以运行时注入的 process.env 为准，避免空 .env 干扰。
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),

    // 限流防护
    ThrottlerModule.forRoot([{
      ttl: parseInt(process.env.THROTTLE_TTL || '60') * 1000,
      limit: parseInt(process.env.THROTTLE_LIMIT || '100'),
    }]),

    // 数据库
    PrismaModule,

    // 业务模块
    AuthModule,
    FilesModule,
    AiModule,
    TestcasesModule,
    TemplatesModule,
    TeamsModule,
    RecordsModule,
    SettingsModule,
    MailModule,

    // 中间件配置
    MiddlewareConfiguration,
  ],
  providers: [
    // 全局限流守卫
    { provide: APP_GUARD, useClass: RateLimitGuard },
    // 全局 JWT 鉴权守卫
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 全局角色权限守卫
    { provide: APP_GUARD, useClass: RolesGuard },
    // 全局 HTTP 异常过滤器
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // 全局响应格式拦截器
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}

import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common'
import { MethodValidationMiddleware } from './method-validation.middleware'

@Module({})
export class MiddlewareConfiguration implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(MethodValidationMiddleware)
      .forRoutes('*') // 应用到所有路由
  }
}
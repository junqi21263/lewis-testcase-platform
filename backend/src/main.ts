import { NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { corsOriginDelegate } from '@/config/cors.config'
import * as fs from 'fs'

async function bootstrap() {
  if (process.env.NODE_ENV === 'production') {
    const jwt = process.env.JWT_SECRET?.trim()
    if (!jwt) {
      throw new Error('JWT_SECRET is required in production. Set it in Railway service variables.')
    }
  }

  const logger = new Logger('Bootstrap')
  // 在 create 时启用 CORS，保证 init() 中早于业务中间件注册，预检能带上 ACAO
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
    cors: {
      origin: corsOriginDelegate(),
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    },
  })

  // 统一 API 前缀
  app.setGlobalPrefix('api')

  // 全局参数校验管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,         // 过滤多余字段
      transform: true,         // 自动类型转换
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  // Swagger API 文档
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('AI 测试用例生成平台 API')
      .setDescription('基于 AI 的智能测试用例生成平台后端接口文档')
      .setVersion('1.0')
      .addBearerAuth()
      .build()
    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('api/docs', app, document)
    logger.log('📚 Swagger 文档已启用: http://localhost:3000/api/docs')
  }

  // 确保上传目录存在
  const uploadDir = process.env.UPLOAD_DIR || './uploads'
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }

  const port = parseInt(process.env.PORT || process.env.APP_PORT || '3000', 10)
  let host = process.env.HOST || '0.0.0.0'
  if (
    process.env.RAILWAY_ENVIRONMENT &&
    (host === '127.0.0.1' || host === 'localhost' || host === '::1')
  ) {
    logger.warn(
      `HOST=${host} 仅本机可访问，Railway 边缘会 502；已改为 0.0.0.0。请删除 Variables 中的 HOST。`,
    )
    host = '0.0.0.0'
  }

  await app.listen(port, host)

  logger.log(
    `🚀 应用启动成功: 监听 ${host}:${port}/api（Railway 请确认 Networking 转发端口与 PORT=${process.env.PORT ?? '未设置'} 一致）`,
  )
}

bootstrap().catch((err: unknown) => {
  const logger = new Logger('Bootstrap')
  const msg = err instanceof Error ? err.stack || err.message : String(err)
  logger.error(`启动失败（Railway 上常表现为 502）:\n${msg}`)
  process.exit(1)
})

import { NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import helmet from 'helmet'
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

  // 安全响应头（生产）；避免干扰本地 Swagger / 部分代理，开发环境不启用
  if (process.env.NODE_ENV === 'production') {
    app.use(helmet())
  }

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

  // Railway 健康检查：走裸 Express 路由，不经 globalPrefix / 响应包装 / 守卫，减少 502 误判
  const expressApp = app.getHttpAdapter().getInstance()
  expressApp.get('/health', (_req: Request, res: Response) => {
    res.status(200).type('text/plain').send('ok')
  })

  // Railway 上省略 host 时 Node 会按平台默认绑定（常同时覆盖 IPv4/IPv6）；仍传 0.0.0.0 亦可
  if (process.env.RAILWAY_ENVIRONMENT) {
    await app.listen(port)
  } else {
    await app.listen(port, host)
  }

  logger.log(
    `🚀 应用启动成功: port=${port}（Railway: 裸 GET /health 与 GET /api/health 均可用；PORT 须与 Networking 转发端口一致）`,
  )
}

bootstrap().catch((err: unknown) => {
  const logger = new Logger('Bootstrap')
  const msg = err instanceof Error ? err.stack || err.message : String(err)
  logger.error(`启动失败（Railway 上常表现为 502）:\n${msg}`)
  process.exit(1)
})

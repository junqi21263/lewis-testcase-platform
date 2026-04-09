import { NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'
import * as path from 'path'
import * as fs from 'fs'

async function bootstrap() {
  const logger = new Logger('Bootstrap')
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  })

  // 统一 API 前缀
  app.setGlobalPrefix('api')

  // 跨域配置
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3001',
    'https://lewis-testcase-platform-xyqvs7bh.edgeone.cool',
  ]
  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL)
  }
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

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

  const port = parseInt(process.env.APP_PORT || '3000')
  await app.listen(port)

  logger.log(`🚀 应用启动成功: http://localhost:${port}/api`)
}

bootstrap()

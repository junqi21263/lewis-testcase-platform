/// <reference lib="dom" />

import { Injectable, UnauthorizedException, ValidationPipe, type NestInterceptor } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common'
import { Controller, Get, Module } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { Observable } from 'rxjs'
import { AuthController } from '@/modules/auth/auth.controller'
import { AiController } from '@/modules/ai/ai.controller'
import { FilesController } from '@/modules/files/files.controller'
import { AuthService } from '@/modules/auth/auth.service'
import { CaptchaService } from '@/modules/auth/captcha.service'
import { AiService } from '@/modules/ai/ai.service'
import { AnalysisReportPdfService } from '@/modules/ai/analysis-report-pdf.service'
import { FilesService } from '@/modules/files/files.service'
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator'
import { HttpExceptionFilter, AllExceptionsFilter } from '@/common/filters/http-exception.filter'
import { ResponseInterceptor } from '@/common/interceptors/response.interceptor'
import { assertUploadMagicNumber } from '@/modules/files/file-upload-validation.util'

type JsonEnvelope<T> = {
  code: number
  message: string
  data: T
}

@Controller('health')
class TestHealthController {
  @Get()
  ping() {
    return { ok: true }
  }
}

@Injectable()
class TestJwtGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const req = context.switchToHttp().getRequest<{
      headers?: { authorization?: string }
      user?: Record<string, string>
    }>()
    const authorization = req.headers?.authorization ?? ''
    if (authorization !== 'Bearer test-token') {
      throw new UnauthorizedException('未授权，请先登录')
    }
    req.user = {
      id: 'u-1',
      username: 'tester',
      role: 'ADMIN',
      email: 'tester@example.com',
    }
    return true
  }
}

@Module({
  controllers: [AuthController, AiController, FilesController, TestHealthController],
  providers: [
    { provide: APP_GUARD, useClass: TestJwtGuard },
    {
      provide: AuthService,
      useValue: {
        login: jest.fn(async (dto: unknown, ip: string | undefined) => ({
          user: { id: 'u-1', username: 'tester', role: 'ADMIN' },
          token: `token-for-${ip || 'unknown'}`,
          dto,
        })),
        registerSendCode: jest.fn(async (dto: unknown) => ({ pending: true, dto })),
        registerConfirm: jest.fn(async (dto: unknown) => ({ created: true, dto })),
        registerResendCode: jest.fn(async (dto: unknown) => ({ resent: true, dto })),
        forgotPassword: jest.fn(async (dto: unknown) => ({ ok: true, dto })),
        resetPassword: jest.fn(async (dto: unknown) => ({ ok: true, dto })),
        getProfile: jest.fn(async () => ({ id: 'u-1', username: 'tester', role: 'ADMIN' })),
        updateProfile: jest.fn(async (_userId: string, data: unknown) => ({ updated: true, data })),
        changePassword: jest.fn(async () => ({ updated: true })),
        logout: jest.fn(async (_userId: string, token: string) => ({ revoked: true, token })),
      },
    },
    {
      provide: CaptchaService,
      useValue: {
        create: jest.fn(async (action?: string) => ({
          captchaId: 'captcha-1',
          image: '<svg />',
          action: action ?? 'login',
        })),
      },
    },
    {
      provide: AiService,
      useValue: {
        getModels: jest.fn(() => [{ id: 'm-1', name: 'ark-code-latest' }]),
        generate: jest.fn(async (dto: unknown, userId: string) => ({ mode: 'generate', dto, userId })),
        generateStream: jest.fn(async (dto: any, userId: string, res: any) => {
          res.setHeader('Content-Type', 'text/event-stream')
          res.write(`data: ${JSON.stringify({ phase: 'generate', userId, sourceType: dto.sourceType })}\n\n`)
          res.end('data: [DONE]\n\n')
        }),
        analyzeStream: jest.fn(async (dto: any, userId: string, res: any) => {
          res.setHeader('Content-Type', 'text/event-stream')
          res.write(`data: ${JSON.stringify({ phase: 'analyze', userId, sourceType: dto.sourceType })}\n\n`)
          res.end('data: [DONE]\n\n')
        }),
        listAnalysisVersions: jest.fn(async () => []),
        getStreamSnapshot: jest.fn(async () => ({ recordId: 'r-1', content: 'snapshot' })),
        diffAnalysisVersions: jest.fn(async () => ({ fields: [] })),
        triggerAnalysisCrossReview: jest.fn(async () => ({ status: 'pending' })),
        assertCanAccessAnalysisRecord: jest.fn(async () => undefined),
        testModelConnectivity: jest.fn(async () => ({ ok: true })),
        runRequirementCaseClosedLoop: jest.fn(async () => ({ ok: true })),
      },
    },
    {
      provide: AnalysisReportPdfService,
      useValue: {
        render: jest.fn(async () => Buffer.from('%PDF-1.7 mock\n')),
      },
    },
    {
      provide: FilesService,
      useValue: {
        saveUploadedFile: jest.fn(async (file: Express.Multer.File) => {
          const uploadBuffer = file.buffer?.length ? file.buffer : Buffer.from([])
          assertUploadMagicNumber(uploadBuffer, file.originalname, file.mimetype)
          return {
            id: 'file-1',
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: uploadBuffer.length,
            status: 'PENDING',
          }
        }),
        saveUploadedChunk: jest.fn(async () => ({ saved: true })),
        mergeChunkedUpload: jest.fn(async (_userId: string, dto: unknown) => ({ merged: true, dto })),
        getFileList: jest.fn(async () => ({ list: [], total: 0, page: 1, pageSize: 10 })),
        streamParseEvents: jest.fn(async (_id: string, _userId: string, res: any) => {
          res.setHeader('Content-Type', 'text/event-stream')
          res.write(`data: ${JSON.stringify({ stage: 'PARSING' })}\n\n`)
          res.end('data: [DONE]\n\n')
        }),
        retryParse: jest.fn(async () => ({ retried: true })),
        cancelTask: jest.fn(async () => ({ cancelled: true })),
        restructureFromEditedText: jest.fn(async () => ({ structured: true })),
        getFileById: jest.fn(async () => ({ id: 'file-1', status: 'PARSED', parsedContent: 'ok' })),
        deleteFile: jest.fn(async () => ({ deleted: true })),
      },
    },
  ],
})
class HttpContractTestModule {}

async function startApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [HttpContractTestModule],
  }).compile()

  const app = moduleRef.createNestApplication()
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter())
  app.useGlobalInterceptors(new ResponseInterceptor() as NestInterceptor<unknown, unknown>)
  await app.init()
  await app.listen(0, '127.0.0.1')

  const server = app.getHttpServer() as { address(): { port: number } }
  return {
    app,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    authService: moduleRef.get(AuthService) as jest.Mocked<AuthService>,
    filesService: moduleRef.get(FilesService) as jest.Mocked<FilesService>,
  }
}

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const text = await response.text()
  return {
    response,
    body: text ? (JSON.parse(text) as JsonEnvelope<T>) : null,
  }
}

describe('HTTP contract', () => {
  let app: INestApplication
  let baseUrl: string
  let authService: jest.Mocked<AuthService>
  let filesService: jest.Mocked<FilesService>

  beforeAll(async () => {
    const started = await startApp()
    app = started.app
    baseUrl = started.baseUrl
    authService = started.authService
    filesService = started.filesService
  })

  afterAll(async () => {
    await app.close()
  })

  it('returns real 400 for non-whitelisted auth body fields', async () => {
    const { response, body } = await requestJson(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'tester@example.com',
        password: 'Password123!',
        captchaId: 'captcha-1',
        captchaCode: 'abcd',
        creatorId: 'attacker',
      }),
    })

    expect(response.status).toBe(400)
    expect(body?.code).toBe(400)
    expect(body?.message).toContain('creatorId')
  })

  it('keeps public and private auth routes on real HTTP semantics', async () => {
    const login = await requestJson<{ token: string }>(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'tester@example.com',
        password: 'Password123!',
        captchaId: 'captcha-1',
        captchaCode: 'abcd',
      }),
    })
    expect(login.response.status).toBe(200)
    expect(login.body?.code).toBe(0)
    expect(authService.login).toHaveBeenCalled()

    const unauthorized = await requestJson(`${baseUrl}/auth/profile`)
    expect(unauthorized.response.status).toBe(401)
    expect(unauthorized.body?.code).toBe(401)

    const profile = await requestJson(`${baseUrl}/auth/profile`, {
      headers: { Authorization: 'Bearer test-token' },
    })
    expect(profile.response.status).toBe(200)
    expect(profile.body?.data).toMatchObject({ id: 'u-1', username: 'tester' })

    const logout = await requestJson<{ token: string }>(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
      },
    })
    expect(logout.response.status).toBe(200)
    expect(logout.body?.data).toMatchObject({ revoked: true, token: 'test-token' })
  })

  it('rejects non-whitelisted AI stream payload fields with HTTP 400', async () => {
    const invalid = await requestJson(`${baseUrl}/ai/analyze/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        sourceType: 'text',
        text: '登录需求',
        creatorId: 'attacker',
      }),
    })

    expect(invalid.response.status).toBe(400)
    expect(invalid.body?.message).toContain('creatorId')
  })

  it('serves analysis and generation streams as text/event-stream', async () => {
    const analyze = await fetch(`${baseUrl}/ai/analyze/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        sourceType: 'text',
        text: '登录需求',
        stream: true,
      }),
    })
    const analyzeText = await analyze.text()
    expect(analyze.status).toBe(200)
    expect(analyze.headers.get('content-type')).toContain('text/event-stream')
    expect(analyzeText).toContain('"phase":"analyze"')

    const generate = await fetch(`${baseUrl}/ai/generate/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        sourceType: 'text',
        text: '登录需求',
        templateId: 'tpl-1',
        stream: true,
      }),
    })
    const generateText = await generate.text()
    expect(generate.status).toBe(200)
    expect(generate.headers.get('content-type')).toContain('text/event-stream')
    expect(generateText).toContain('"phase":"generate"')
  })

  it('rejects forged image uploads and keeps allowed uploads on the HTTP path', async () => {
    const badForm = new FormData()
    badForm.append(
      'file',
      new File([Buffer.from('%PDF-fake png')], 'fake.png', { type: 'image/png' }),
    )
    const bad = await fetch(`${baseUrl}/files/upload`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      body: badForm,
    })
    const badBody = (await bad.json()) as JsonEnvelope<null>
    expect(bad.status).toBe(400)
    expect(badBody.message).toContain('文件内容与声明类型不一致')

    const goodForm = new FormData()
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
    goodForm.append('file', new File([pngHeader], 'ok.png', { type: 'image/png' }))
    const good = await fetch(`${baseUrl}/files/upload`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      body: goodForm,
    })
    const goodBody = (await good.json()) as JsonEnvelope<{ id: string }>
    expect(good.status).toBe(201)
    expect(goodBody.code).toBe(0)
    expect(goodBody.data.id).toBe('file-1')
    expect(filesService.saveUploadedFile).toHaveBeenCalled()
  })

  it('rejects invalid merge mime types and oversized additional file arrays before service execution', async () => {
    const merge = await requestJson(`${baseUrl}/files/upload/merge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        fileId: '550e8400-e29b-41d4-a716-446655440000',
        originalName: 'flow.exe',
        mimeType: 'application/x-msdownload',
        chunkTotal: 2,
      }),
    })
    expect(merge.response.status).toBe(400)
    expect(merge.body?.message).toContain('不支持的文件 MIME 类型')

    const analysis = await requestJson(`${baseUrl}/ai/analyze/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        sourceType: 'file',
        fileId: 'file-1',
        additionalFileIds: ['1', '2', '3', '4', '5'],
      }),
    })
    expect(analysis.response.status).toBe(400)
    expect(analysis.body?.message).toContain('additionalFileIds')
  })
})

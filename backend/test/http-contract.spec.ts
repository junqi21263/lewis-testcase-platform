/// <reference lib="dom" />

import { Injectable, UnauthorizedException, ValidationPipe, type NestInterceptor } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common'
import { Controller, Get, Module } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { Observable } from 'rxjs'
import request from 'supertest'
import { AuthController } from '@/modules/auth/auth.controller'
import { AiController } from '@/modules/ai/ai.controller'
import { FilesController } from '@/modules/files/files.controller'
import { RecordsController } from '@/modules/records/records.controller'
import { ReviewsController } from '@/modules/reviews/reviews.controller'
import { SettingsController } from '@/modules/settings/settings.controller'
import { AuthService } from '@/modules/auth/auth.service'
import { CaptchaService } from '@/modules/auth/captcha.service'
import { AiService } from '@/modules/ai/ai.service'
import { AnalysisReportPdfService } from '@/modules/ai/analysis-report-pdf.service'
import { FilesService } from '@/modules/files/files.service'
import { RecordsService } from '@/modules/records/records.service'
import { ReviewsService } from '@/modules/reviews/reviews.service'
import { SettingsService } from '@/modules/settings/settings.service'
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator'
import { HttpExceptionFilter, AllExceptionsFilter } from '@/common/filters/http-exception.filter'
import { ResponseInterceptor } from '@/common/interceptors/response.interceptor'
import { RolesGuard } from '@/common/guards/roles.guard'
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
    if (!authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('未授权，请先登录')
    }
    const token = authorization.slice('Bearer '.length)
    const role =
      token === 'viewer-token'
        ? 'VIEWER'
        : token === 'member-token'
          ? 'MEMBER'
          : token === 'super-token'
            ? 'SUPER_ADMIN'
            : 'ADMIN'
    req.user = {
      id: 'u-1',
      username: 'tester',
      role,
      email: 'tester@example.com',
      teamId: 'team-1',
    }
    return true
  }
}

@Module({
  controllers: [
    AuthController,
    AiController,
    FilesController,
    RecordsController,
    ReviewsController,
    SettingsController,
    TestHealthController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: TestJwtGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
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
    {
      provide: RecordsService,
      useValue: {
        getPublicShareContent: jest.fn(async (token: string) => ({ token, recordId: 'record-1' })),
        getTeamStats: jest.fn(async () => ({ total: 1 })),
        compare: jest.fn(async () => ({ diff: [] })),
        getSummary: jest.fn(async () => ({ total: 1 })),
        getDistinctModels: jest.fn(async () => ['ark-code-latest']),
        getMatchingIds: jest.fn(async (_user: unknown, q: Record<string, unknown>) => ({
          ids: ['record-1'],
          page: Number(q.page ?? 1),
          pageSize: Number(q.pageSize ?? 20),
        })),
        batch: jest.fn(async (_user: unknown, ids: string[], action: string, tags?: string[]) => ({
          affected: ids.length,
          action,
          tags: tags ?? [],
        })),
        getRecords: jest.fn(async (_user: unknown, q: Record<string, unknown>) => ({
          list: [{ id: 'record-1', title: '支付流程', status: 'SUCCESS' }],
          total: 1,
          page: Number(q.page ?? 1),
          pageSize: Number(q.pageSize ?? 20),
        })),
        listAuditLogs: jest.fn(async () => [{ id: 'audit-1' }]),
        listDownloadsForRecord: jest.fn(async () => [{ id: 'download-1' }]),
        exportRecord: jest.fn(async () => ({
          content: Buffer.from('excel'),
          filename: 'record.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })),
        createShare: jest.fn(async () => ({ token: 'share-token' })),
        patch: jest.fn(async (_id: string, _user: unknown, dto: unknown) => ({ updated: true, dto })),
        getById: jest.fn(async () => ({ id: 'record-1', title: '支付流程' })),
        restore: jest.fn(async () => ({ restored: true })),
        permanentDelete: jest.fn(async () => ({ deleted: true })),
        softDelete: jest.fn(async () => ({ deleted: true })),
      },
    },
    {
      provide: ReviewsService,
      useValue: {
        getWorkspace: jest.fn(async (recordId: string) => ({ recordId, cases: [] })),
        getCaseDetail: jest.fn(async (recordId: string, caseId: string) => ({ recordId, caseId })),
        saveCaseEdit: jest.fn(async (_recordId: string, _caseId: string, _user: unknown, body: unknown) => ({
          saved: true,
          body,
        })),
        updateReviewStatus: jest.fn(async () => ({ updated: true })),
        batchUpdateReviewStatus: jest.fn(async (_recordId: string, _user: unknown, caseIds: string[]) => ({
          affected: caseIds.length,
        })),
        importExecutionResults: jest.fn(async (_recordId: string, _user: unknown, body: unknown) => ({
          imported: Array.isArray((body as { results?: unknown[] }).results)
            ? (body as { results: unknown[] }).results.length
            : 0,
        })),
        listVersions: jest.fn(async () => []),
        getVersion: jest.fn(async (versionId: string) => ({ id: versionId })),
        restoreVersion: jest.fn(async () => ({ restored: true })),
        diffVersions: jest.fn(async () => ({ fields: [] })),
        listComments: jest.fn(async () => []),
        addComment: jest.fn(async (_recordId: string, _caseId: string, _user: unknown, content: string) => ({
          content,
        })),
        bootstrapForRecordByRecordId: jest.fn(async () => ({ bootstrapped: true })),
      },
    },
    {
      provide: SettingsService,
      useValue: {
        getRuntimeHints: jest.fn(() => ({ maxUploadMb: 10, maxImages: 5 })),
        getMultimodalConfig: jest.fn(() => ({ multimodalEnabled: true })),
        updateMultimodalConfig: jest.fn(async (dto: unknown) => ({ updated: true, dto })),
        listAiModelsAdmin: jest.fn(async () => [{ id: 'model-1', name: 'ark-code-latest' }]),
        createAiModel: jest.fn(async (dto: unknown) => ({ id: 'model-1', dto })),
        updateAiModel: jest.fn(async (_id: string, dto: unknown) => ({ updated: true, dto })),
        archiveAiModel: jest.fn(async () => ({ archived: true })),
        deleteAiModel: jest.fn(async () => ({ deleted: true })),
        setDefaultAiModel: jest.fn(async () => ({ isDefault: true })),
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
    recordsService: moduleRef.get(RecordsService) as jest.Mocked<RecordsService>,
    reviewsService: moduleRef.get(ReviewsService) as jest.Mocked<ReviewsService>,
    settingsService: moduleRef.get(SettingsService) as jest.Mocked<SettingsService>,
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
  let recordsService: jest.Mocked<RecordsService>
  let reviewsService: jest.Mocked<ReviewsService>
  let settingsService: jest.Mocked<SettingsService>

  beforeAll(async () => {
    const started = await startApp()
    app = started.app
    baseUrl = started.baseUrl
    authService = started.authService
    filesService = started.filesService
    recordsService = started.recordsService
    reviewsService = started.reviewsService
    settingsService = started.settingsService
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
    const onePixelPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0R8AAAAASUVORK5CYII=',
      'base64',
    )
    goodForm.append('file', new File([onePixelPng], 'ok.png', { type: 'image/png' }))
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

  it('keeps records list on a stable HTTP/body contract and passes pagination through service', async () => {
    const res = await request(app.getHttpServer())
      .get('/records')
      .query({ page: 2, pageSize: 30, keyword: '支付' })
      .set('Authorization', 'Bearer admin-token')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      code: 0,
      message: '查询成功',
      data: {
        total: 1,
        page: 2,
        pageSize: 30,
      },
    })
    expect(recordsService.getRecords).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ADMIN' }),
      expect.objectContaining({ page: '2', pageSize: '30', keyword: '支付' }),
    )
  })

  it('rejects non-whitelisted records batch payload fields before service execution', async () => {
    const res = await request(app.getHttpServer())
      .post('/records/batch')
      .set('Authorization', 'Bearer admin-token')
      .send({
        ids: ['record-1'],
        action: 'UPDATE_TAGS',
        tags: ['支付'],
        rogue: 'blocked',
      })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe(400)
    expect(res.body.message).toContain('rogue')
    expect(recordsService.batch).not.toHaveBeenCalled()
  })

  it('validates review edit dto and keeps success envelope on save', async () => {
    const ok = await request(app.getHttpServer())
      .patch('/reviews/records/record-1/cases/case-1')
      .set('Authorization', 'Bearer admin-token')
      .send({
        title: '登录成功-邮箱密码登录',
        priority: 'P1',
        type: 'FUNCTIONAL',
        tags: ['登录', '邮箱'],
        precondition: '用户已注册',
        steps: [{ order: 1, action: '输入邮箱密码', expected: '页面接受输入' }],
        expectedResults: ['登录成功'],
        expectedResult: '进入工作台',
      })

    expect(ok.status).toBe(200)
    expect(ok.body.code).toBe(0)
    expect(reviewsService.saveCaseEdit).toHaveBeenCalledWith(
      'record-1',
      'case-1',
      expect.objectContaining({ role: 'ADMIN' }),
      expect.objectContaining({
        title: '登录成功-邮箱密码登录',
        tags: ['登录', '邮箱'],
      }),
    )

    const bad = await request(app.getHttpServer())
      .patch('/reviews/records/record-1/cases/case-1')
      .set('Authorization', 'Bearer admin-token')
      .send({
        title: '非法 payload',
        priority: 'P1',
        type: 'FUNCTIONAL',
        tags: ['登录'],
        steps: [{ order: 1, action: '输入', unexpected: 'x' }],
        expectedResults: ['成功'],
        expectedResult: '成功',
      })

    expect(bad.status).toBe(400)
    expect(bad.body.message).toContain('unexpected')
  })

  it('rejects oversized reviews batch payloads before service and preserves error code', async () => {
    const res = await request(app.getHttpServer())
      .post('/reviews/records/record-1/batch-status')
      .set('Authorization', 'Bearer admin-token')
      .send({
        caseIds: Array.from({ length: 101 }, (_, index) => `case-${index}`),
        status: 'APPROVED',
      })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe(400)
    expect(reviewsService.batchUpdateReviewStatus).not.toHaveBeenCalled()
  })

  it('enforces admin role on settings endpoints and transforms runtime dto values', async () => {
    const forbidden = await request(app.getHttpServer())
      .post('/settings/models')
      .set('Authorization', 'Bearer viewer-token')
      .send({
        name: 'Viewer Model',
        provider: 'OpenAI',
        modelId: 'gpt-4o',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
      })

    expect(forbidden.status).toBe(403)
    expect(forbidden.body.code).toBe(403)

    const runtime = await request(app.getHttpServer())
      .patch('/settings/multimodal-config')
      .set('Authorization', 'Bearer admin-token')
      .send({
        multimodalEnabled: false,
        maxConcurrentTasks: '4',
      })

    expect(runtime.status).toBe(200)
    expect(runtime.body.code).toBe(0)
    expect(settingsService.updateMultimodalConfig).toHaveBeenCalledWith(
      expect.objectContaining({ multimodalEnabled: false, maxConcurrentTasks: 4 }),
      'u-1',
      expect.any(String),
    )

    const invalidModel = await request(app.getHttpServer())
      .post('/settings/models')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Ark',
        provider: 'OpenAI',
        modelId: 'ark-code-latest',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        leakedField: 'blocked',
      })

    expect(invalidModel.status).toBe(400)
    expect(invalidModel.body.message).toContain('leakedField')
  })
})

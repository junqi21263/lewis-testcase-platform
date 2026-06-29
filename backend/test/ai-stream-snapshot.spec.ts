import { BadRequestException, Controller, Get, Injectable, Module, UnauthorizedException, ValidationPipe } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AiController } from '@/modules/ai/ai.controller'
import { AiService } from '@/modules/ai/ai.service'
import { AnalysisReportPdfService } from '@/modules/ai/analysis-report-pdf.service'
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator'
import { HttpExceptionFilter, AllExceptionsFilter } from '@/common/filters/http-exception.filter'
import { ResponseInterceptor } from '@/common/interceptors/response.interceptor'

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
  controllers: [AiController, TestHealthController],
  providers: [
    { provide: APP_GUARD, useClass: TestJwtGuard },
    {
      provide: AiService,
      useValue: {
        getModels: jest.fn(() => [{ id: 'm-1', name: 'ark-code-latest' }]),
        getStreamSnapshot: jest.fn(async (recordId: string) => ({
          recordId,
          status: 'GENERATING',
          errorMessage: null,
          content: 'stream snapshot body',
        })),
        generate: jest.fn(),
        generateStream: jest.fn(),
        analyzeStream: jest.fn(),
        listAnalysisVersions: jest.fn(),
        diffAnalysisVersions: jest.fn(),
        triggerAnalysisCrossReview: jest.fn(),
        assertCanAccessAnalysisRecord: jest.fn(),
        testModelConnectivity: jest.fn(),
        runRequirementCaseClosedLoop: jest.fn(),
      },
    },
    {
      provide: AnalysisReportPdfService,
      useValue: {
        render: jest.fn(),
      },
    },
  ],
})
class AiStreamSnapshotTestModule {}

async function startApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AiStreamSnapshotTestModule],
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
  app.useGlobalInterceptors(new ResponseInterceptor())
  await app.init()
  await app.listen(0, '127.0.0.1')

  const server = app.getHttpServer() as { address(): { port: number } }
  return {
    app,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    aiService: moduleRef.get(AiService) as jest.Mocked<AiService>,
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

describe('AI stream snapshot API', () => {
  let app: INestApplication
  let baseUrl: string
  let aiService: jest.Mocked<AiService>

  beforeAll(async () => {
    const started = await startApp()
    app = started.app
    baseUrl = started.baseUrl
    aiService = started.aiService
  })

  afterAll(async () => {
    await app.close()
  })

  it('requires auth before reading a stream snapshot', async () => {
    const { response, body } = await requestJson(`${baseUrl}/ai/streams/record-1/snapshot`)

    expect(response.status).toBe(401)
    expect(body?.code).toBe(401)
  })

  it('returns snapshot payload over the HTTP API for authorized callers', async () => {
    const { response, body } = await requestJson<{
      recordId: string
      status: string
      errorMessage: string | null
      content: string
    }>(`${baseUrl}/ai/streams/record-1/snapshot`, {
      headers: { Authorization: 'Bearer test-token' },
    })

    expect(response.status).toBe(200)
    expect(body?.code).toBe(0)
    expect(body?.data).toEqual({
      recordId: 'record-1',
      status: 'GENERATING',
      errorMessage: null,
      content: 'stream snapshot body',
    })
    expect(aiService.getStreamSnapshot).toHaveBeenCalledWith('record-1', 'u-1')
  })

  it('preserves a real 400 when the snapshot record cannot be accessed', async () => {
    aiService.getStreamSnapshot.mockRejectedValueOnce(new BadRequestException('生成记录不存在或无权访问'))

    const { response, body } = await requestJson(`${baseUrl}/ai/streams/missing/snapshot`, {
      headers: { Authorization: 'Bearer test-token' },
    })

    expect(response.status).toBe(400)
    expect(body?.code).toBe(400)
    expect(body?.message).toContain('生成记录不存在或无权访问')
  })
})

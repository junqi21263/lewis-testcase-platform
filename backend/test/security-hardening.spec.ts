import { BadRequestException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { CaseReviewStatus } from '@prisma/client'
import { HttpExceptionFilter, AllExceptionsFilter } from '@/common/filters/http-exception.filter'
import { CreateSuiteDto, UpdateTestCaseDto } from '@/modules/testcases/dto/testcase-update.dto'
import {
  AddReviewCommentDto,
  BatchReviewStatusDto,
  SaveReviewCaseDto,
  UpdateReviewStatusDto,
} from '@/modules/reviews/dto/review.dto'
import { ExportAnalysisPdfDto } from '@/modules/ai/dto/export-analysis-pdf.dto'
import { JwtDenylistService } from '@/modules/auth/jwt-denylist.service'

async function validateDto<T extends object>(cls: new () => T, payload: unknown) {
  return validate(plainToInstance(cls, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  })
}

function mockHost(exceptionPath = '/api/boom') {
  const json = jest.fn()
  const status = jest.fn(() => ({ json }))
  const response = { status, json }
  const request = { method: 'GET', url: exceptionPath }
  return {
    response,
    request,
    host: {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as any,
  }
}

describe('security hardening regressions from quality report', () => {
  it('keeps HTTP 4xx compatibility but returns real HTTP status for 5xx HttpException', () => {
    const filter = new HttpExceptionFilter()
    const badRequest = mockHost('/api/bad-request')
    filter.catch(new BadRequestException('bad'), badRequest.host)
    expect(badRequest.response.status).toHaveBeenCalledWith(HttpStatus.OK)

    const unavailable = mockHost('/api/unavailable')
    filter.catch(new HttpException('upstream down', HttpStatus.SERVICE_UNAVAILABLE), unavailable.host)
    expect(unavailable.response.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE)
  })

  it('returns HTTP 500 for uncaught exceptions so gateways and monitors can detect failures', () => {
    const filter = new AllExceptionsFilter()
    const ctx = mockHost('/api/unhandled')
    filter.catch(new Error('db failed'), ctx.host)
    expect(ctx.response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
  })

  it('rejects non-whitelisted testcases DTO fields', async () => {
    await expect(validateDto(CreateSuiteDto, { name: 'suite', creatorId: 'attacker' })).resolves.toHaveLength(1)
    await expect(
      validateDto(UpdateTestCaseDto, {
        title: 'case',
        expectedResult: 'ok',
        creatorId: 'attacker',
      }),
    ).resolves.toHaveLength(1)
  })

  it('rejects non-whitelisted reviews DTO fields and caps large arrays/text', async () => {
    await expect(
      validateDto(SaveReviewCaseDto, {
        title: 'case',
        priority: 'P1',
        type: 'FUNCTIONAL',
        tags: [],
        precondition: '',
        steps: [{ order: 1, action: 'do it' }],
        expectedResults: ['ok'],
        expectedResult: '[1] ok',
        creatorId: 'attacker',
      }),
    ).resolves.toHaveLength(1)

    await expect(
      validateDto(UpdateReviewStatusDto, {
        status: CaseReviewStatus.approved,
        comment: 'x'.repeat(4001),
      }),
    ).resolves.not.toHaveLength(0)

    await expect(
      validateDto(BatchReviewStatusDto, {
        caseIds: Array.from({ length: 101 }, (_, i) => `case-${i}`),
        status: CaseReviewStatus.approved,
      }),
    ).resolves.not.toHaveLength(0)

    await expect(
      validateDto(AddReviewCommentDto, {
        content: 'x'.repeat(4001),
      }),
    ).resolves.not.toHaveLength(0)
  })

  it('accepts recordId on PDF export DTO for ownership checks and rejects extra fields', async () => {
    await expect(validateDto(ExportAnalysisPdfDto, { markdown: '# ok', recordId: 'record-1' })).resolves.toHaveLength(0)
    await expect(validateDto(ExportAnalysisPdfDto, { markdown: '# ok', creatorId: 'attacker' })).resolves.toHaveLength(1)
  })

  it('stores logout token in denylist and rejects it until expiry', async () => {
    const redis = {
      isReady: jest.fn(() => false),
    }
    const denylist = new JwtDenylistService(redis as any)
    await denylist.revoke('token-1', Math.floor(Date.now() / 1000) + 60)

    await expect(denylist.assertNotRevoked('token-1')).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(denylist.assertNotRevoked('token-2')).resolves.toBeUndefined()
  })
})

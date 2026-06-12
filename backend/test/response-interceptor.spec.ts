import { lastValueFrom, of } from 'rxjs'
import { ResponseInterceptor } from '@/common/interceptors/response.interceptor'

function mockContext() {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', url: '/api/templates/tpl_1/evaluations' }),
      getResponse: () => ({ headersSent: false, writableEnded: false }),
    }),
  } as any
}

describe('ResponseInterceptor', () => {
  it('preserves domain objects that contain a message field', async () => {
    const interceptor = new ResponseInterceptor()
    const payload = {
      jobId: 'job_1',
      status: 'queued',
      message: '评测任务已创建，等待后台执行',
    }

    const result = await lastValueFrom(
      interceptor.intercept(mockContext(), { handle: () => of(payload) } as any),
    )

    expect(result.data).toEqual(payload)
  })

  it('still supports explicit response payloads with message and data', async () => {
    const interceptor = new ResponseInterceptor()
    const result = await lastValueFrom(
      interceptor.intercept(mockContext(), {
        handle: () => of({ message: '自定义成功', data: { id: 'ok' } }),
      } as any),
    )

    expect(result.message).toBe('自定义成功')
    expect(result.data).toEqual({ id: 'ok' })
  })
})

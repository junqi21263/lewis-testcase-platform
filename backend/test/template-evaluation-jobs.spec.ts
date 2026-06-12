import { TemplateEvaluationJobsService } from '@/modules/templates/template-evaluation-jobs.service'

describe('TemplateEvaluationJobsService', () => {
  const template = {
    id: 'tpl_1',
    name: '功能测试模板',
    version: 1,
    content: '仅输出 JSON，顶层 cases。{{content}}',
  }

  it('creates a queued job and completes it in the background', async () => {
    const ai = {
      evaluatePromptTemplate: jest.fn().mockResolvedValue({
        templateId: template.id,
        templateName: template.name,
        templateVersion: template.version,
        modelId: 'model-1',
        modelName: 'Model 1',
        params: { temperature: 0.2, maxTokens: 4096 },
        samples: [],
        sampleCount: 0,
        parseSuccessRate: 0,
        averageQualityScore: 0,
        averageCoverageRate: null,
        failures: [],
        warningSamples: [],
        evaluatedAt: new Date().toISOString(),
      }),
    }
    const jobs = new TemplateEvaluationJobsService(ai as any)

    const created = jobs.create('user_1', template, { sampleLimit: 1 })
    expect(created.status).toBe('queued')
    expect(created.stage).toBe('queued')
    expect(created.progress).toBe(0)

    await jobs.waitForIdleForTest(created.jobId)
    const done = jobs.get('user_1', created.jobId)

    expect(done.status).toBe('completed')
    expect(done.stage).toBe('completed')
    expect(done.progress).toBe(100)
    expect(done.report?.templateId).toBe(template.id)
  })

  it('marks a queued job as cancelled', () => {
    const ai = {
      evaluatePromptTemplate: jest.fn(() => new Promise(() => undefined)),
    }
    const jobs = new TemplateEvaluationJobsService(ai as any)
    const created = jobs.create('user_1', template, { sampleLimit: 1 })

    const cancelled = jobs.cancel('user_1', created.jobId)

    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.stage).toBe('cancelled')
    expect(cancelled.progress).toBeLessThan(100)
  })

  it('does not allow reading another user job', () => {
    const jobs = new TemplateEvaluationJobsService({ evaluatePromptTemplate: jest.fn() } as any)
    const created = jobs.create('user_1', template, { sampleLimit: 1 })

    expect(() => jobs.get('user_2', created.jobId)).toThrow('评测任务不存在')
  })
})

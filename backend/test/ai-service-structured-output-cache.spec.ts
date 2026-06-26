import { AiStructuredOutputService } from '@/modules/ai/ai-structured-output.service'

function createService() {
  const config = { get: jest.fn((key: string) => (key === 'AI_STRICT_SCHEMA_OUTPUT' ? 'true' : undefined)) }
  return new AiStructuredOutputService(config as any) as any
}

function createClient() {
  const create = jest
    .fn()
    .mockRejectedValueOnce(new Error('response_format json_schema is not supported'))
    .mockResolvedValueOnce({ choices: [{ message: { content: '{"cases":[]}' } }] })
    .mockResolvedValueOnce({ choices: [{ message: { content: '{"cases":[]}' } }] })

  return {
    chat: {
      completions: {
        create,
      },
    },
  }
}

describe('AiService structured output capability cache', () => {
  it('does not retry json_schema after a model is known to be unsupported', async () => {
    const service = createService()
    const client = createClient()
    const payload = { model: 'deepseek-v4-pro', messages: [], max_tokens: 12000 }

    const first = await service.createCaseCompletion(client, payload)
    const second = await service.createCaseCompletion(client, payload)

    expect(first.fallbackNotice).toContain('json_schema')
    expect(second.fallbackNotice).toBeUndefined()
    expect(client.chat.completions.create).toHaveBeenCalledTimes(3)
    expect(client.chat.completions.create.mock.calls[0][0].response_format.type).toBe('json_schema')
    expect(client.chat.completions.create.mock.calls[1][0].response_format.type).toBe('json_object')
    expect(client.chat.completions.create.mock.calls[2][0].response_format.type).toBe('json_object')
  })

  it('falls back to prompt-only JSON when json_object is unsupported', async () => {
    const service = createService()
    const create = jest
      .fn()
      .mockRejectedValueOnce(new Error('response_format json_schema is not supported'))
      .mockRejectedValueOnce(new Error('response_format.type json_object is not supported by this model'))
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"cases":[]}' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"cases":[]}' } }] })
    const client = { chat: { completions: { create } } }
    const payload = { model: 'ark-code-latest', messages: [], max_tokens: 12000 }

    const first = await service.createCaseCompletion(client, payload)
    const second = await service.createCaseCompletion(client, payload)

    expect(first.fallbackNotice).toContain('json_object')
    expect(second.fallbackNotice).toContain('json_object')
    expect(create).toHaveBeenCalledTimes(4)
    expect(create.mock.calls[0][0].response_format.type).toBe('json_schema')
    expect(create.mock.calls[1][0].response_format.type).toBe('json_object')
    expect(create.mock.calls[2][0].response_format).toBeUndefined()
    expect(create.mock.calls[3][0].response_format).toBeUndefined()
  })
})

import { AiService } from '@/modules/ai/ai.service'

describe('AiService flowchart context prompt', () => {
  function createService() {
    return new AiService(
      {} as any,
      { get: jest.fn(() => undefined) } as any,
      {} as any,
      { bootstrapForRecord: jest.fn() } as any,
      {} as any,
    )
  }

  it('injects explicit flowchart context into generation prompt', () => {
    const service = createService() as any

    const messages = service.buildPromptMessages({
      sourceType: 'text',
      text: '登录流程',
      flowchartContext: '主流程：打开登录页 -> 输入账号密码 -> 进入首页\n异常/分支：账号密码错误 -> 提示错误',
    })

    expect(messages.user).toContain('流程图上下文')
    expect(messages.user).toContain('打开登录页 -> 输入账号密码 -> 进入首页')
    expect(messages.user).toContain('账号密码错误 -> 提示错误')
    expect(messages.user).toContain('针对每条判断分支生成至少 1 条用例')
  })

  it('extracts enriched flowchart summary from parsed file content', () => {
    const service = createService() as any
    const fileContent = `
需求说明：登录流程。

## 流程图结构化摘要
- 主流程：打开登录页 -> 输入账号密码 -> 账号密码是否正确 -> 进入首页
- 异常/分支：账号密码是否正确 -- 否 --> 提示账号或密码错误
`.trim()

    const messages = service.buildPromptMessages({ sourceType: 'file', fileId: 'file-1' }, fileContent)

    expect(messages.user).toContain('流程图上下文')
    expect(messages.user).toContain('账号密码是否正确 -- 否 --> 提示账号或密码错误')
    expect(messages.user).toContain('预期结果必须与流程节点逐步对应')
  })
})

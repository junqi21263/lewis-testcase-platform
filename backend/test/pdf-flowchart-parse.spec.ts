import { PdfFlowchartParseService } from '@/modules/files/pdf-flowchart-parse.service'

describe('PdfFlowchartParseService', () => {
  const service = new PdfFlowchartParseService()

  it('extracts nodes, yes-no branches, main path and exception path from flowchart text', () => {
    const text = `
登录流程图
A[打开登录页] --> B[输入账号密码]
B --> C{账号密码是否正确}
C -- 是 --> D[进入首页]
C -- 否 --> E[提示账号或密码错误]
E --> B
`.trim()

    const context = service.parseFromText(text)

    expect(context).toEqual(
      expect.objectContaining({
        kind: 'flowchart',
        confidence: expect.any(Number),
      }),
    )
    expect(context?.nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining(['打开登录页', '输入账号密码', '账号密码是否正确', '进入首页', '提示账号或密码错误']),
    )
    expect(context?.branches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: '账号密码是否正确', condition: '是', to: '进入首页', type: 'success' }),
        expect.objectContaining({ from: '账号密码是否正确', condition: '否', to: '提示账号或密码错误', type: 'exception' }),
      ]),
    )
    expect(context?.mainPath).toEqual(['打开登录页', '输入账号密码', '账号密码是否正确', '进入首页'])
    expect(context?.exceptionPaths[0]).toEqual(['账号密码是否正确', '提示账号或密码错误'])
  })

  it('does not mark ordinary requirement text as flowchart context', () => {
    const context = service.parseFromText('用户可以使用账号密码登录系统，密码错误时提示错误信息。')

    expect(context).toBeNull()
  })

  it('renders a bounded prompt summary for AI generation', () => {
    const context = service.parseFromText('开始 -> 提交审批 -> 是否通过 -- 否 --> 驳回修改\n是否通过 -- 是 --> 审批完成')

    const summary = service.toPromptContext(context)

    expect(summary).toContain('流程图结构化摘要')
    expect(summary).toContain('主流程')
    expect(summary).toContain('异常/分支')
    expect(summary.length).toBeLessThanOrEqual(4000)
  })
})

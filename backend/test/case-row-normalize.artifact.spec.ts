import { filterPromptInstructionArtifactCases } from '@/modules/ai/case-row-normalize.util'

describe('filterPromptInstructionArtifactCases', () => {
  it('removes prompt-rule and malformed json-field artifact rows before persistence/export', () => {
    const rows = [
      {
        title: '核心流程-"cases": [] 验证',
        precondition: '1. 测试账号具备核心流程访问权限 2. 测试数据满足该需求触发条件',
        steps: [{ order: 1, action: '进入核心流程相关页面或功能入口' }],
        expectedResult: '[1] 页面正常打开',
        tags: ['ai-closed-loop'],
      },
      {
        title: '核心流程-覆盖维度要求**: 验证',
        precondition: '1. 测试账号具备核心流程访问权限 2. 测试数据满足该需求触发条件',
        steps: [{ order: 1, action: '按需求执行“覆盖维度要求”对应操作' }],
        expectedResult: '[1] 系统按需求完成“覆盖维度要求”并给出明确反馈',
        tags: ['ai-closed-loop'],
      },
      {
        title: '邮箱验证码发送成功',
        precondition: '1. 邮箱有效 2. 网络正常',
        steps: [{ order: 1, action: '输入邮箱并点击发送验证码' }],
        expectedResult: '[1] 邮箱收到 6 位验证码',
        tags: ['功能'],
      },
    ]

    expect(filterPromptInstructionArtifactCases(rows)).toEqual([rows[2]])
  })
})

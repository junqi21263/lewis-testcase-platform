import { describe, expect, it } from 'vitest'
import {
  filterPromptInstructionArtifactCases,
  parseAiCasesFromText,
} from './parseAiCasesFromText'

describe('filterPromptInstructionArtifactCases', () => {
  it('filters prompt-rule and json-field artifact cases from generated results', () => {
    const rows = [
      {
        title: '核心流程-"cases": [] 验证',
        precondition: '1. 测试账号具备核心流程访问权限 2. 测试数据满足该需求触发条件',
        steps: [{ order: 1, action: '进入核心流程相关页面或功能入口' }],
        expectedResult: '[1] 页面正常打开',
        tags: ['ai-closed-loop'],
      },
      {
        title: '核心流程-颗粒度要求**: 验证',
        precondition: '1. 测试账号具备核心流程访问权限 2. 测试数据满足该需求触发条件',
        steps: [{ order: 1, action: '按需求执行“颗粒度要求”对应操作' }],
        expectedResult: '[1] 系统按需求完成“颗粒度要求”并给出明确反馈',
        tags: ['ai-closed-loop'],
      },
      {
        title: '邀请码登录成功',
        precondition: '1. 已注册邮箱 2. 邀请码有效',
        steps: [{ order: 1, action: '输入邮箱、密码和邀请码并提交' }],
        expectedResult: '[1] 登录成功并进入工作台',
        tags: ['功能'],
      },
    ]

    expect(filterPromptInstructionArtifactCases(rows)).toEqual([rows[2]])
  })
})

describe('parseAiCasesFromText', () => {
  it('drops malformed json-field artifact rows when parsing AI json output', () => {
    const raw = JSON.stringify({
      cases: [
        {
          title: '核心流程-"priority": "P0",验证',
          steps: [{ order: 1, action: '进入核心流程相关页面或功能入口' }],
          expectedResult: '[1] 系统按需求完成对应操作',
          tags: ['ai-closed-loop'],
        },
        {
          title: '邮箱验证码发送成功',
          steps: [{ order: 1, action: '输入邮箱并点击发送验证码' }],
          expectedResult: '[1] 邮箱收到 6 位验证码',
          priority: 'P1',
          type: 'FUNCTIONAL',
          tags: ['功能'],
        },
      ],
    })

    const cases = parseAiCasesFromText(raw)
    expect(cases).toHaveLength(1)
    expect(cases[0]?.title).toBe('邮箱验证码发送成功')
  })
})

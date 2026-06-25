import { describe, expect, it } from 'vitest'
import looseOutput from '@/test/fixtures/contracts/ai-output/payment-loose-output.md?raw'
import { parseAiCasesFromText } from './parseAiCasesFromText'
import { parseLooseMarkdownToCaseRows } from './parseLooseAiOutput'

describe('parseLooseMarkdownToCaseRows contract fixtures', () => {
  it('parses semi-structured payment cases into stable rows', () => {
    const rows = parseLooseMarkdownToCaseRows(looseOutput)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      title: '用例 1：提交订单成功',
      priority: 'P1',
      type: 'FUNCTIONAL',
      precondition: '用户已登录且购物车存在商品',
      expectedResult: '订单创建成功并进入待支付状态',
    })
    expect(rows[0]?.tags).toContain('模块:支付')
    expect(rows[0]?.steps).toEqual([
      { order: 1, action: '进入购物车', expected: '展示已选商品' },
      { order: 2, action: '提交订单', expected: '生成待支付订单' },
    ])
    expect(rows[1]).toMatchObject({
      title: '用例 2：余额不足提示',
      priority: 'P2',
      expectedResult: '支付失败且订单保持待支付状态',
    })
  })

  it('does not convert corrupted testcase JSON fragments into fake markdown cases', () => {
    const corruptedJson = `{
  "cases": [
    {
      "title": "密码登录成功",
      "priority": "P0",
      "type": "FUNCTIONAL",
      "precondition": "用户已注册",
      "steps": [
        { "order": 1, "action": "输入邮箱和密码", "expected": "校验通过" },
        { "order": 2, "action": "点击登录", "expected": "进入工作台" }
      ],
      "expectedResult": "[1] 校验通过\\n[2] 进入工作台"
    },
    {
      "priority": "P0",
      "type": "FUNCTIONAL",
      "precondition": "测试账号具备核心流程访问权限",
      "steps": [
        "进入核心流程相关页面或功能入口",
        "按需求执行 \\"priority\\": \\"P0\\" 对应操作",
        "观察页面反馈、数据状态与后续入口"
      ],
      "expectedResult": "[1] 核心流程入口可正常访问 [2] 系统按需完成 \\"priority\\": \\"P0\\""
    }
`

    expect(parseLooseMarkdownToCaseRows(corruptedJson)).toEqual([])

    const cases = parseAiCasesFromText(corruptedJson)
    expect(cases).toHaveLength(1)
    expect(cases[0]?.tags).toContain('ai-raw-output')
    expect(cases[0]?.title).not.toContain('"cases"')
    expect(cases[0]?.title).not.toContain('"priority"')
  })

  it('does not show prompt instruction artifacts as generated cases', () => {
    const pollutedJson = JSON.stringify({
      cases: [
        {
          title: '密码登录-密码错误提示',
          priority: 'P1',
          type: 'FUNCTIONAL',
          precondition: '1. 用户处于登录页面\n2. 用户已注册邮箱账号',
          steps: [
            { order: 1, action: '输入已注册邮箱和错误密码', expected: '字段可正常输入' },
            { order: 2, action: '点击登录', expected: '显示密码错误提示' },
          ],
          expectedResult: '[1] 字段可正常输入\n[2] 显示密码错误提示',
          tags: ['用户登录', '功能'],
        },
        {
          title: '核心流程-所有用例必须唯一，无重复场景验证',
          priority: 'P2',
          type: 'FUNCTIONAL',
          precondition: '1. 测试账号具备核心流程访问权限 2. 测试数据满足该需求触发条件',
          steps: [
            { order: 1, action: '进入核心流程相关页面或功能入口' },
            { order: 2, action: '按需求执行「所有用例必须唯一，无重复场景」对应操作' },
            { order: 3, action: '观察页面反馈、数据状态与后续操作入口' },
          ],
          expectedResult: '[1] 核心流程入口可正常访问 [2] 系统按需完成「所有用例必须唯一，无重复场景」并给出明确反馈',
          tags: ['ai-closed-loop', '功能'],
        },
        {
          title: '核心流程-覆盖维度要求**：验证',
          priority: 'P2',
          type: 'FUNCTIONAL',
          precondition: '1. 测试账号具备核心流程访问权限 2. 测试数据满足该需求触发条件',
          steps: [
            { order: 1, action: '进入核心流程相关页面或功能入口' },
            { order: 2, action: '按需求执行「覆盖维度要求」对应操作' },
            { order: 3, action: '观察页面反馈、数据状态与后续操作入口' },
          ],
          expectedResult: '[1] 核心流程入口可正常访问 [2] 系统按需完成「覆盖维度要求」并给出明确反馈',
          tags: ['ai-closed-loop', '功能'],
        },
      ],
    })

    const cases = parseAiCasesFromText(pollutedJson)

    expect(cases).toHaveLength(1)
    expect(cases[0]?.title).toBe('密码登录-密码错误提示')
    expect(cases.map((item) => item.title).join('\n')).not.toContain('所有用例必须')
    expect(cases.map((item) => item.title).join('\n')).not.toContain('覆盖维度要求')
  })
})

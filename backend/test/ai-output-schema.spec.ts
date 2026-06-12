import { buildStrictCaseResponseFormat, validateCaseRowsAgainstSchema } from '@/modules/ai/testcase-output-schema.util'
import { normalizeCaseRowForPersistence } from '@/modules/ai/case-row-normalize.util'

describe('strict testcase output schema', () => {
  const validCase = {
    title: '订单-提交成功',
    module: '订单',
    priority: 'P0',
    riskLevel: 'high',
    type: 'FUNCTIONAL',
    precondition: '1. 用户已登录',
    steps: [
      { order: 1, action: '进入订单确认页', expected: '展示订单金额' },
      { order: 2, action: '点击提交订单', expected: '订单提交成功' },
    ],
    expectedResult: '[1] 展示订单金额\n[2] 订单提交成功',
    tags: ['模块:订单', '功能'],
    mermaid: 'flowchart TD\nA[确认页] --> B[提交订单]',
  }

  it('builds strict json_schema response format for model calls', () => {
    const format = buildStrictCaseResponseFormat()
    expect(format).toMatchObject({
      type: 'json_schema',
      json_schema: {
        name: 'testcase_generation_result',
        strict: true,
      },
    })
    expect(format.json_schema.schema.properties.cases.items.required).toEqual(expect.arrayContaining(['module', 'riskLevel', 'mermaid']))
  })

  it('passes rows that contain module, risk level, mermaid and step expectations', () => {
    const result = validateCaseRowsAgainstSchema([validCase])
    expect(result).toEqual({ ok: true, errors: [], missingFields: [] })
  })

  it('rejects missing schema fields before persistence repair', () => {
    const { module: _module, riskLevel: _riskLevel, mermaid: _mermaid, ...missingTopFields } = validCase
    const rows = [
      {
        ...missingTopFields,
        steps: [{ order: 1, action: '提交订单' }],
      },
    ]

    const result = validateCaseRowsAgainstSchema(rows)

    expect(result.ok).toBe(false)
    expect(result.missingFields).toEqual(expect.arrayContaining(['module', 'riskLevel', 'mermaid', 'steps.expected']))
  })

  it('normalizes schema fields into persistent tags and description', () => {
    const normalized = normalizeCaseRowForPersistence(validCase)

    expect(normalized.tags).toEqual(expect.arrayContaining(['模块:订单', '风险:high', '功能']))
    expect(normalized.description).toContain('Mermaid:')
    expect(normalized.description).toContain('flowchart TD')
  })
})

import fs from 'fs'
import path from 'path'
import { parseLooseMarkdownToCaseRows } from '@/modules/ai/parse-loose-ai-output.util'

describe('parseLooseMarkdownToCaseRows contract fixtures', () => {
  it('parses semi-structured payment cases into stable rows', () => {
    const fixture = fs.readFileSync(
      path.join(__dirname, 'fixtures/contracts/ai-output/payment-loose-output.md'),
      'utf8',
    )
    const rows = parseLooseMarkdownToCaseRows(fixture)

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
})

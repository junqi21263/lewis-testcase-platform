import type { TestCase } from '@/types'

export const contractExportCases: TestCase[] = [
  {
    id: 'case-1',
    suiteId: 'suite-1',
    title: '支付成功后生成订单',
    description: '覆盖主流程',
    precondition: '用户已登录且购物车存在商品',
    priority: 'P1',
    type: 'FUNCTIONAL',
    status: 'DRAFT',
    tags: ['模块:支付', '冒烟'],
    expectedResult: '订单状态为已支付',
    steps: [
      { order: 1, action: '提交订单', expected: '创建待支付订单' },
      { order: 2, action: '完成支付', expected: '返回支付成功' },
    ],
  },
]

// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GenerateCoverageCommandCenter, GenerateScopeSelector } from './GeneratePage'
import type { GenerateHandoffPlan } from '@/utils/generateHandoffPlan'
import type { TestCase } from '@/types'

const handoffPlan: GenerateHandoffPlan = {
  requirements: [
    { id: 'REQ-001', text: '用户输入邮箱密码登录', type: 'functional' },
    { id: 'REQ-002', text: '验证码校验通过后完成登录', type: 'functional' },
  ],
  testPaths: [
    { id: 'TP-001', label: '打开登录页 -> 输入账号 -> 点击登录', type: 'main', nodes: ['打开登录页', '输入账号', '点击登录'] },
  ],
  selectedRequirementIds: ['REQ-001', 'REQ-002'],
  selectedTestPathIds: ['TP-001'],
  qualityAverage: 86,
  openQuestionCount: 1,
  inputWarningCount: 0,
  automationSummary: { automatable: 2, manual: 1, blocked: 0 },
  estimatedCaseCount: 9,
}

const generatedCases: TestCase[] = [
  {
    id: 'case-1',
    title: '邮箱密码登录成功',
    precondition: '用户已注册',
    steps: [{ order: 1, action: '输入邮箱密码' }],
    expectedResult: '进入工作台',
    priority: 'P1',
    type: 'FUNCTIONAL',
    tags: ['登录'],
    status: 'APPROVED',
    suiteId: 'suite-1',
    requirementIds: ['REQ-001'],
    testPathIds: ['TP-001'],
    automationReadiness: { status: 'automatable', reason: '页面稳定' },
  },
]

describe('GeneratePage coverage widgets', () => {
  it('allows selecting REQ and TP scopes from user perspective', async () => {
    const user = userEvent.setup()
    const onRequirementChange = vi.fn()
    const onTestPathChange = vi.fn()

    render(
      <GenerateScopeSelector
        plan={handoffPlan}
        selectedRequirementIds={['REQ-001']}
        selectedTestPathIds={['TP-001']}
        onRequirementChange={onRequirementChange}
        onTestPathChange={onTestPathChange}
      />,
    )

    await user.click(screen.getByLabelText(/REQ-002/i))
    expect(onRequirementChange).toHaveBeenCalledWith(['REQ-001', 'REQ-002'])

    await user.click(screen.getByRole('button', { name: '清空' }))
    expect(onRequirementChange).toHaveBeenLastCalledWith([])
    expect(onTestPathChange).toHaveBeenLastCalledWith([])
  })

  it('renders coverage command center summary after generation', () => {
    render(
      <GenerateCoverageCommandCenter
        plan={handoffPlan}
        cases={generatedCases}
        selectedRequirementIds={['REQ-001', 'REQ-002']}
        selectedTestPathIds={['TP-001']}
        qualityReport={null}
      />,
    )

    expect(screen.getByTestId('generate-coverage-command-center')).toHaveTextContent('覆盖驾驶舱')
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('1/2 个需求')).toBeInTheDocument()
    expect(screen.getByText('TP 1/1')).toBeInTheDocument()
  })
})

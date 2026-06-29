// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import type { ClosedLoopResult, TestCase } from '@/types'
import { useGenerateStore } from './generateStore'

function sampleCase(): TestCase {
  return {
    id: 'case-1',
    title: '登录成功',
    precondition: '用户已注册',
    steps: [{ order: 1, action: '输入邮箱和密码' }],
    expectedResult: '成功进入工作台',
    priority: 'P1',
    type: 'FUNCTIONAL',
    tags: ['login'],
    status: 'DRAFT',
    suiteId: 'suite-1',
  }
}

function sampleClosedLoopResult(): ClosedLoopResult {
  return {
    recordId: 'record-1',
    suiteId: 'suite-1',
    beforeScore: 72,
    afterScore: 88,
    addedCount: 1,
    updatedCount: 2,
    duplicateMarkedCount: 0,
    cases: [sampleCase()],
    qualityReport: {
      score: 88,
      summary: '质量已修复',
      requirementPointsTotal: 3,
      coverageRate: 0.67,
      coverage: [],
      duplicateCount: 0,
      genericCount: 1,
      nonExecutableCount: 0,
      riskDistribution: [],
      priorityDistribution: [],
      suggestions: ['补充异常流程'],
      issues: [],
    },
    actions: [],
    summary: '已完成闭环修复',
  }
}

describe('generateStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useGenerateStore.getState().reset()
  })

  it('tracks generating loading and failed states without losing the error detail', () => {
    useGenerateStore.getState().setIsGenerating(true)
    useGenerateStore.getState().setClosedLoopStatus('running', { summary: '正在生成测试用例' })

    let state = useGenerateStore.getState()
    expect(state.isGenerating).toBe(true)
    expect(state.closedLoopStatus).toBe('running')
    expect(state.closedLoopSummary).toBe('正在生成测试用例')

    useGenerateStore.getState().setClosedLoopStatus('failed', { error: '模型返回空结果' })
    useGenerateStore.getState().setIsGenerating(false)

    state = useGenerateStore.getState()
    expect(state.isGenerating).toBe(false)
    expect(state.closedLoopStatus).toBe('failed')
    expect(state.closedLoopError).toBe('模型返回空结果')
  })

  it('promotes a successful closed loop result into the result step', () => {
    useGenerateStore.getState().applyClosedLoopResult(sampleClosedLoopResult())

    const state = useGenerateStore.getState()
    expect(state.currentStep).toBe('result')
    expect(state.closedLoopStatus).toBe('succeeded')
    expect(state.lastRecordId).toBe('record-1')
    expect(state.lastSuiteId).toBe('suite-1')
    expect(state.qualityScore).toBe(88)
    expect(state.qualitySuggestions).toContain('补充异常流程')
    expect(state.generatedCases).toHaveLength(1)
  })
})

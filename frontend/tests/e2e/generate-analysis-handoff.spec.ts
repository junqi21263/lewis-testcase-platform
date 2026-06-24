import { expect, test } from '@playwright/test'

function apiOk<T>(data: T) {
  return { code: 0, data, message: 'ok' }
}

function buildLoginGeneratedCases() {
  return [
    {
      id: 'case-1',
      title: '邮箱密码登录成功',
      precondition: '用户已注册且图形验证码有效',
      steps: [{ order: 1, action: '输入正确邮箱、密码和验证码', expected: '登录成功' }],
      expectedResult: '进入工作台',
      priority: 'P1',
      type: 'FUNCTIONAL',
      tags: ['模块:登录'],
      status: 'DRAFT',
      suiteId: 'suite-1',
      requirementIds: ['REQ-001'],
      testPathIds: ['TP-001'],
      automationReadiness: { status: 'automatable', reason: '页面元素稳定' },
    },
    {
      id: 'case-2',
      title: '验证码错误时展示提示',
      precondition: '用户已注册',
      steps: [{ order: 1, action: '输入错误图形验证码并提交登录', expected: '展示验证码错误' }],
      expectedResult: '停留登录页并显示清晰错误提示',
      priority: 'P1',
      type: 'FUNCTIONAL',
      tags: ['模块:登录'],
      status: 'DRAFT',
      suiteId: 'suite-1',
      requirementIds: ['REQ-002'],
      testPathIds: ['TP-002'],
      automationReadiness: { status: 'automatable', reason: '可通过 UI 自动化验证' },
    },
  ]
}

test.describe('AI 需求分析到生成用例联动', () => {
  test('展示 REQ/TP 范围选择与覆盖驱动生成预览', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
      sessionStorage.clear()
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            user: {
              id: 'u-1',
              username: 'handoff-user',
              email: 'handoff@example.com',
              role: 'ADMIN',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            token: 'mock-token',
            isAuthenticated: true,
            rememberMe: false,
          },
          version: 0,
        }),
      )
      localStorage.setItem(
        'generate-session-v1',
        JSON.stringify({
          state: {
            currentStep: 'prompt',
            sourceType: 'text',
            inputText: '用户登录需求：邮箱密码登录、图形验证码校验、错误提示。',
            requirementDescription: '登录主流程与异常流程',
            userNotes: '需要避免生成注册、找回密码等无关用例。',
            customPrompt: '请生成结构化测试用例 JSON。',
            selectedTemplateId: null,
            aiParams: { stream: true, forceConfiguredModel: true, maxTokens: 32768 },
            analysisHandoffContext: {
              analysisRecordId: 'analysis-1',
              analysisTitle: '登录需求分析报告',
              sourceReport: '需求分析报告',
              createdAt: '2026-06-24T00:00:00.000Z',
              structuredResult: {
                requirements: [
                  { id: 'REQ-001', text: '用户可以使用邮箱和密码登录', type: 'functional' },
                  { id: 'REQ-002', text: '验证码错误时展示清晰错误提示', type: 'risk' },
                ],
                flowchart: {
                  nodes: [],
                  branches: [],
                  paths: [
                    { id: 'TP-001', type: 'main', nodes: ['输入邮箱密码', '进入工作台'] },
                    { id: 'TP-002', type: 'exception', nodes: ['输入邮箱密码', '验证码错误提示'] },
                  ],
                },
                qualityScores: {
                  completeness: 86,
                  testability: 91,
                  interfaceClarity: 74,
                  riskCoverage: 80,
                  flowCompleteness: 88,
                  reasons: [],
                },
                openQuestions: [{ category: 'permission', text: '哪些角色允许登录后台？' }],
                inputWarnings: [{ type: 'interface_missing', message: '缺少登录接口错误码约束' }],
                automationReadiness: {
                  automatable: ['TP-001 登录主流程'],
                  manual: ['视觉样式验收'],
                  blocked: ['缺少测试账号池'],
                },
              },
            },
          },
          version: 0,
        }),
      )
    })

    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url())
      const p = url.pathname
      const method = route.request().method()

      if (!p.startsWith('/api/')) {
        await route.continue()
        return
      }

      if (p === '/api/auth/profile' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              id: 'u-1',
              username: 'handoff-user',
              email: 'handoff@example.com',
              role: 'ADMIN',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            }),
          ),
        })
        return
      }

      if (p === '/api/preferences/me' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk({ theme: 'dark', weatherCityName: '广州' })),
        })
        return
      }

      if (p === '/api/ai/models' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk([
              {
                id: 'cfg-ark',
                name: 'ark-code-latest',
                provider: 'Ark',
                modelId: 'ark-code-latest',
                baseUrl: 'https://ark.example/v1',
                isDefault: true,
                maxTokens: 32768,
                temperature: 0.2,
              },
            ]),
          ),
        })
        return
      }

      if (p === '/api/templates' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk({ list: [], total: 0, page: 1, pageSize: 100 })),
        })
        return
      }

      if (p === '/api/records' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk({ list: [], total: 0, page: 1, pageSize: 10 })),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(apiOk({})),
      })
    })

    await page.goto('/generate')

    await expect(page.getByText('AI 需求分析上下文')).toBeVisible()
    await expect(page.getByTestId('generate-coverage-command-center')).toBeVisible()
    await expect(page.getByTestId('generate-case-results-board')).toBeVisible()
    await expect(page.getByTestId('generate-result-filter-bar')).toBeVisible()
    await expect(page.getByText('覆盖驱动生成')).toBeVisible()
    await expect(page.getByText('生成范围选择')).toBeVisible()
    await expect(page.getByText('REQ-001')).toBeVisible()
    await expect(page.getByText('TP-002')).toBeVisible()
    await expect(page.getByText('已接入 AI 需求分析报告，将按所选 REQ/TP 生成并回填覆盖关系')).toBeVisible()
    await expect(page.getByText('REQ 2/2 · TP 2/2')).toBeVisible()

    const layout = await page.evaluate(() => {
      const studio = document.querySelector('.generate-case-studio')
      const main = document.querySelector('main')
      const studioRect = studio?.getBoundingClientRect()
      const mainRect = main?.getBoundingClientRect()
      return {
        documentScrollHeight: document.documentElement.scrollHeight,
        documentClientHeight: document.documentElement.clientHeight,
        mainScrollHeight: main?.scrollHeight ?? 0,
        mainClientHeight: main?.clientHeight ?? 0,
        studioTop: studioRect?.top ?? 0,
        studioBottom: studioRect?.bottom ?? 0,
        mainTop: mainRect?.top ?? 0,
        mainBottom: mainRect?.bottom ?? 0,
      }
    })
    expect(layout.documentScrollHeight).toBeLessThanOrEqual(layout.documentClientHeight + 1)
    expect(layout.mainScrollHeight).toBeLessThanOrEqual(layout.mainClientHeight + 1)
    expect(layout.studioTop).toBeGreaterThanOrEqual(layout.mainTop)
    expect(layout.studioBottom).toBeLessThanOrEqual(layout.mainBottom + 1)
  })

  test('生成结果默认按 REQ/TP 分组并收起高级设置', async ({ page }) => {
    const generatedCases = buildLoginGeneratedCases()

    await page.addInitScript(() => {
      localStorage.clear()
      sessionStorage.clear()
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            user: {
              id: 'u-1',
              username: 'handoff-user',
              email: 'handoff@example.com',
              role: 'ADMIN',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            token: 'mock-token',
            isAuthenticated: true,
            rememberMe: false,
          },
          version: 0,
        }),
      )
      const structuredResult = {
        requirements: [
          { id: 'REQ-001', text: '用户可以使用邮箱和密码登录', type: 'functional' },
          { id: 'REQ-002', text: '验证码错误时展示清晰错误提示', type: 'risk' },
        ],
        flowchart: {
          nodes: [],
          branches: [],
          paths: [
            { id: 'TP-001', type: 'main', nodes: ['输入邮箱密码', '进入工作台'] },
            { id: 'TP-002', type: 'exception', nodes: ['输入邮箱密码', '验证码错误提示'] },
          ],
        },
        qualityScores: {
          completeness: 86,
          testability: 91,
          interfaceClarity: 74,
          riskCoverage: 80,
          flowCompleteness: 88,
          reasons: [],
        },
      }
      localStorage.setItem(
        'generate-session-v1',
        JSON.stringify({
          state: {
            currentStep: 'prompt',
            sourceType: 'text',
            inputText: '用户登录需求：邮箱密码登录、图形验证码校验、错误提示。',
            requirementDescription: '登录主流程与异常流程',
            userNotes: '需要避免生成注册、找回密码等无关用例。',
            customPrompt: '请生成结构化测试用例 JSON。',
            selectedTemplateId: null,
            aiParams: { stream: true, forceConfiguredModel: true, maxTokens: 32768 },
            analysisHandoffContext: {
              analysisRecordId: 'analysis-1',
              analysisTitle: '登录需求分析报告',
              sourceReport: '需求分析报告',
              createdAt: '2026-06-24T00:00:00.000Z',
              structuredResult,
            },
          },
          version: 0,
        }),
      )
    })

    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url())
      const p = url.pathname
      const method = route.request().method()

      if (!p.startsWith('/api/')) {
        await route.continue()
        return
      }

      if (p === '/api/auth/profile' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              id: 'u-1',
              username: 'handoff-user',
              email: 'handoff@example.com',
              role: 'ADMIN',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            }),
          ),
        })
        return
      }

      if (p === '/api/preferences/me' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk({ theme: 'dark', weatherCityName: '广州' })),
        })
        return
      }

      if (p === '/api/ai/models' && method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiOk([])) })
        return
      }

      if (p === '/api/templates' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk({ list: [], total: 0, page: 1, pageSize: 100 })),
        })
        return
      }

      if (p === '/api/records' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk({ list: [], total: 0, page: 1, pageSize: 10 })),
        })
        return
      }

      if (p === '/api/ai/generate/stream' && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: [
            `data: ${JSON.stringify({ content: JSON.stringify({ cases: generatedCases }) })}`,
            `data: ${JSON.stringify({ suiteId: 'suite-1', recordId: 'record-1', caseCount: generatedCases.length })}`,
            'data: [DONE]',
            '',
          ].join('\n\n'),
        })
        return
      }

      if (p === '/api/testcases/suites/suite-1/cases' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk(generatedCases)),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(apiOk({})),
      })
    })

    await page.goto('/generate')

    await expect(page.getByTestId('generate-advanced-settings')).not.toHaveAttribute('open', '')
    await page.getByRole('button', { name: /开始生成/ }).click()
    await expect(page.getByTestId('generate-grouped-results')).toBeVisible()
    await expect(page.getByTestId('generate-requirement-group-REQ-001')).toBeVisible()
    await expect(page.getByTestId('generate-requirement-group-REQ-002')).toBeVisible()
    await expect(page.getByRole('heading', { name: '邮箱密码登录成功' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '验证码错误时展示提示' })).toBeVisible()
  })
})

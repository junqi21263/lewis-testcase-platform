import { expect, test } from '@playwright/test'

function apiOk<T>(data: T) {
  return { code: 0, data, message: 'ok' }
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
})

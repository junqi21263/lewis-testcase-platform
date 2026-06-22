import { expect, test } from '@playwright/test'

function apiOk<T>(data: T) {
  return { code: 0, data, message: 'ok' }
}

test.describe('生成记录模型筛选', () => {
  test('模型下拉读取当前后台配置并按单选模型筛选', async ({ page }) => {
    const recordRequests: string[] = []

    await page.addInitScript(() => {
      localStorage.clear()
      sessionStorage.clear()
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            user: {
              id: 'u-1',
              username: 'records-user',
              email: 'records@example.com',
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
    })

    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      const p = url.pathname
      const method = route.request().method()

      if (p === '/api/auth/profile' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              id: 'u-1',
              username: 'records-user',
              email: 'records@example.com',
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
          body: JSON.stringify(apiOk({ theme: 'dark', weatherCityName: '多伦多' })),
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
              {
                id: 'cfg-astron',
                name: 'astron-code-latest',
                provider: 'Zhipu',
                modelId: 'astron-code-latest',
                baseUrl: 'https://astron.example/v1',
                isDefault: false,
                maxTokens: 32768,
                temperature: 0.2,
              },
            ]),
          ),
        })
        return
      }

      if (p === '/api/records/meta/models' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk([{ modelId: 'legacy-model', modelName: '历史模型' }])),
        })
        return
      }

      if (p === '/api/records/summary' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              total: 1,
              success: 1,
              failed: 0,
              processing: 0,
              pending: 0,
              archived: 0,
              cancelled: 0,
              successRate: 100,
            }),
          ),
        })
        return
      }

      if (p === '/api/records' && method === 'GET') {
        recordRequests.push(url.search)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              list: [
                {
                  id: 'r-1',
                  title: '登录用例生成',
                  prompt: '登录需求',
                  status: 'SUCCESS',
                  reviewStatus: 'pending_review',
                  caseCount: 20,
                  modelId: 'ark-code-latest',
                  modelName: 'ark-code-latest',
                  duration: 1200,
                  createdAt: '2026-06-22T00:00:00.000Z',
                  updatedAt: '2026-06-22T00:00:00.000Z',
                  creatorId: 'u-1',
                  creator: { id: 'u-1', username: 'records-user' },
                  sourceType: 'text',
                  tags: [],
                },
              ],
              total: 1,
              page: 1,
              pageSize: 20,
            }),
          ),
        })
        return
      }

      await route.continue()
    })

    await page.goto('/records')

    const modelSelect = page.getByLabel('按模型筛选生成记录')
    await expect(modelSelect).toBeVisible()
    await expect(modelSelect).toHaveValue('all')
    await expect(modelSelect.locator('option')).toHaveText([
      '全部',
      'ark-code-latest',
      'astron-code-latest',
    ])
    await expect(modelSelect.locator('option', { hasText: '历史模型' })).toHaveCount(0)

    await modelSelect.selectOption('cfg-ark')
    await expect(page.getByText('模型：ark-code-latest')).toBeVisible()
    await expect
      .poll(() => recordRequests.some((query) => query.includes('models=ark-code-latest')))
      .toBe(true)
  })
})

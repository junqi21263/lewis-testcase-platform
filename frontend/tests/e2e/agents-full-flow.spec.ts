import { expect, test } from '@playwright/test'

function apiOk<T>(data: T) {
  return { code: 0, data }
}

test.describe('E2E: login -> generate -> export/share', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
      sessionStorage.clear()
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            user: {
              id: 'u-1',
              username: 'tester',
              email: 'tester@example.com',
              role: 'MEMBER',
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
      if (p === '/api/templates') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              list: [{ id: 'tpl-1', name: '默认模板', content: '请根据需求生成测试用例' }],
              pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
            }),
          ),
        })
        return
      }
      if (p === '/api/ai/models') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk([{ id: 'm-1', modelId: 'mock-model', modelName: 'Mock', isDefault: true }]),
          ),
        })
        return
      }
      if (p === '/api/auth/login') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              accessToken: 'mock-token',
              user: {
                id: 'u-1',
                username: 'tester',
                email: 'tester@example.com',
                role: 'MEMBER',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            }),
          ),
        })
        return
      }
      if (p === '/api/records/rec-1') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk({ id: 'rec-1', suiteId: null })),
        })
        return
      }
      if (p === '/api/records/rec-1/shares') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({ token: 'share-token', path: '/records/public/shares/share-token', expiresAt: null }),
          ),
        })
        return
      }
      if (p === '/api/ai/generate') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              recordId: 'rec-1',
              cases: [
                {
                  id: 'case-1',
                  title: '登录成功',
                  expectedResult: '进入首页',
                  priority: 'P1',
                  type: 'FUNCTIONAL',
                  precondition: '存在有效账号',
                  steps: [{ order: 1, action: '输入账号密码并登录', expected: '登录成功' }],
                  tags: ['认证'],
                },
              ],
              tokensUsed: 123,
              duration: 1.2,
            }),
          ),
        })
        return
      }
      await route.fallback()
    })
  })

  test('works through core generation flow', async ({ page }) => {
    await page.goto('/generate', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: '生成测试用例' })).toBeVisible()

    await page.getByRole('button', { name: '文本输入' }).click()
    await page.getByPlaceholder('请输入需求描述、功能说明、API 文档等内容...').fill('用户可以登录系统')
    await page.getByPlaceholder('例如：请根据以上需求生成完整的功能测试用例').fill('请输出标准测试用例')
    await page.getByLabel('流式输出').uncheck()

    await page.getByRole('button', { name: '开始生成' }).click()
    await expect(page.getByRole('heading', { name: '生成完成' })).toBeVisible()
    await expect(page.getByText(/共生成 1 条测试用例/)).toBeVisible()

    await expect(page.getByRole('button', { name: '导出 Excel' })).toBeVisible()
    await page.getByRole('button', { name: '生成分享链接' }).click()
    await expect(page.getByText(/分享链接已复制|分享已创建/)).toBeVisible()
  })
})

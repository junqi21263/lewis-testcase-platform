import { expect, test } from '@playwright/test'

function apiOk<T>(data: T) {
  return { code: 0, data }
}

test.describe('系统设置控制台', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
      sessionStorage.clear()
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            user: {
              id: 'admin-1',
              username: 'settings-admin',
              email: 'admin@example.com',
              role: 'SUPER_ADMIN',
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
              id: 'admin-1',
              username: 'settings-admin',
              email: 'admin@example.com',
              role: 'SUPER_ADMIN',
              avatar: '',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            }),
          ),
        })
        return
      }

      if (p === '/api/settings/runtime' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              maxUploadMb: 10,
              maxFileSizeBytes: 10485760,
              throttleTtlSec: 60,
              throttleLimit: 100,
              visionPdfMinTextChars: 120,
              visionPdfAlways: false,
              redis: { ready: true, enabled: true, urlConfigured: true },
              queues: [
                { name: 'file-parse', pending: 0 },
                { name: 'ai-analysis', pending: 3 },
                { name: 'ai-generate', pending: 1 },
              ],
              workers: {
                fileParseEnabled: true,
                fileParseMaxConcurrent: 3,
                fileParseIntervalMs: 1500,
                fileParseTimeoutMinutes: 15,
              },
              streamRecovery: {
                enabled: true,
                snapshotEndpoint: '/api/ai/streams/:recordId/snapshot',
                maxChars: 2000000,
              },
              templateCache: { redisEnabled: true, ttlMs: 30000 },
            }),
          ),
        })
        return
      }

      if (p === '/api/settings/models' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk([
              {
                id: 'm-1',
                name: 'GPT 默认模型',
                provider: 'OpenAI',
                modelId: 'gpt-4o',
                baseUrl: 'https://api.openai.com/v1',
                maxTokens: 32768,
                temperature: 0.7,
                isDefault: true,
                isActive: true,
                supportsVision: false,
                useForDocumentVisionParse: false,
                hasApiKey: true,
                lastTestOk: true,
                lastTestAt: '2026-06-18T00:00:00.000Z',
                lastTestLatencyMs: 420,
                lastTestError: null,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
              {
                id: 'm-2',
                name: 'Ark 视觉模型',
                provider: 'Ark',
                modelId: 'doubao-vision',
                baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
                maxTokens: 8192,
                temperature: 0.2,
                isDefault: false,
                isActive: true,
                supportsVision: true,
                useForDocumentVisionParse: true,
                hasApiKey: false,
                lastTestOk: false,
                lastTestAt: '2026-06-18T00:00:00.000Z',
                lastTestLatencyMs: null,
                lastTestError: '401',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ]),
          ),
        })
        return
      }

      if (p === '/api/settings/multimodal-config' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              multimodalEnabled: true,
              multimodalDefaultModel: 'doubao-vision',
              textFallbackModel: 'gpt-4o',
              maxConcurrentTasks: 3,
              cacheTtlDays: 7,
              monthlyCostAlertCny: 100,
              autoDowngradeWhenOverBudget: true,
              multimodalInputPricePer1kCny: 0.01,
              multimodalOutputPricePer1kCny: 0.02,
              textInputPricePer1kCny: 0.001,
              textOutputPricePer1kCny: 0.002,
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

      if (p === '/api/admin/users' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk({ list: [], total: 0, page: 1, pageSize: 20 })),
        })
        return
      }

      if (p === '/api/admin/audit-logs' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              list: [
                {
                  id: 'audit-1',
                  action: 'SETTINGS_AI_MODEL_UPDATE',
                  detail: {
                    targetType: 'AI_MODEL',
                    targetId: 'm-1',
                    targetName: 'GPT 默认模型',
                    changedFields: ['name', 'apiKey'],
                    apiKeyChanged: true,
                    modelId: 'gpt-4o',
                  },
                  ip: '127.0.0.1',
                  createdAt: '2026-06-18T08:00:00.000Z',
                  operator: { id: 'admin-1', username: 'settings-admin' },
                  targetUser: { id: 'admin-1', username: 'settings-admin' },
                },
              ],
              total: 1,
              page: 1,
              pageSize: 30,
            }),
          ),
        })
        return
      }

      await route.continue()
    })
  })

  test('展示设置控制台总览和模型中心', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' })

    await expect(page.getByRole('heading', { name: '设置控制台' })).toBeVisible()
    await expect(page.getByText('Redis 已连接')).toBeVisible()
    await expect(page.getByText('流式恢复已启用')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'AI 模型中心' })).toBeVisible()
    const modelHub = page.locator('#section-ai-models')
    await expect(modelHub.getByText('GPT 默认模型')).toBeVisible()
    await expect(modelHub.getByText('Ark 视觉模型')).toBeVisible()
    await expect(page.getByText('文件解析 / OCR')).toBeVisible()
  })

  test('Provider 预设可填充新增模型表单并支持模型筛选', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' })

    await page.getByRole('button', { name: '新增模型' }).click()
    await page.getByLabel('Provider 预设').selectOption('deepseek')
    await expect(page.getByLabel('Base URL')).toHaveValue('https://api.deepseek.com/v1')
    await expect(page.getByLabel('Model ID')).toHaveValue('deepseek-chat')

    await page.getByRole('button', { name: '仅失败' }).click()
    const modelHub = page.locator('#section-ai-models')
    await expect(modelHub.getByText('Ark 视觉模型')).toBeVisible()
    await expect(modelHub.getByText('GPT 默认模型')).toBeHidden()
  })

  test('运维审计日志展示系统设置操作和安全摘要', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' })

    await page.getByRole('heading', { name: '运维审计日志' }).scrollIntoViewIfNeeded()
    const auditSection = page.locator('#section-audit')
    await expect(auditSection.getByText('编辑模型')).toBeVisible()
    await expect(auditSection.getByText('目标：')).toBeVisible()
    await expect(auditSection.getByText('GPT 默认模型')).toBeVisible()
    await expect(auditSection.getByText('字段：name、apiKey，API Key 已更新')).toBeVisible()
    await expect(auditSection.getByText('IP：127.0.0.1')).toBeVisible()
  })
})

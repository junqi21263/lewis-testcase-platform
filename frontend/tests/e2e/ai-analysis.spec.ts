import { expect, test } from '@playwright/test'

function apiOk<T>(data: T) {
  return { code: 0, data }
}

test.describe('E2E: AI 需求分析全流程', () => {
  test.beforeEach(async ({ page }) => {
    // 注入已认证状态
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

    // Mock 所有 API
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      const p = url.pathname
      const method = route.request().method()

      // 文件列表（历史记录）
      if (p === '/api/files' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              list: [],
              total: 0,
              page: 1,
              pageSize: 20,
            }),
          ),
        })
        return
      }

      // 模型列表
      if (p === '/api/ai/models' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk([
              {
                id: 'm-1',
                name: 'GPT-4o',
                provider: 'openai',
                modelId: 'gpt-4o',
                isDefault: true,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ]),
          ),
        })
        return
      }

      // 文件上传
      if (p === '/api/files/upload' && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              id: 'file-1',
              name: 'xxx.txt',
              originalName: '需求文档.txt',
              size: 1024,
              mimeType: 'text/plain',
              fileType: 'TEXT',
              status: 'PARSED',
              parsedContent: '这是一个测试需求文档的内容，包含用户管理和登录功能。',
              structuredRequirements: ['用户登录功能', '用户注册功能'],
              uploaderId: 'u-1',
              createdAt: '2026-04-30T00:00:00.000Z',
              updatedAt: '2026-04-30T00:00:00.000Z',
            }),
          ),
        })
        return
      }

      // 文件详情（轮询用）
      if (p.startsWith('/api/files/') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              id: 'file-1',
              name: 'xxx.txt',
              originalName: '需求文档.txt',
              size: 1024,
              mimeType: 'text/plain',
              fileType: 'TEXT',
              status: 'PARSED',
              parsedContent: '这是一个测试需求文档的内容，包含用户管理和登录功能。',
              structuredRequirements: ['用户登录功能', '用户注册功能'],
              uploaderId: 'u-1',
              createdAt: '2026-04-30T00:00:00.000Z',
              updatedAt: '2026-04-30T00:00:00.000Z',
            }),
          ),
        })
        return
      }

      // AI 需求分析流式（与前端 aiApi.analyzeStream 一致）
      if (p === '/api/ai/analyze/stream' && method === 'POST') {
        const chunks = [
          '## 1. 主要功能需求\n',
          '- **用户登录**：支持账号密码登录\n',
          '- **用户注册**：支持邮箱注册\n',
          '\n## 2. 非功能需求\n',
          '- **性能**：响应时间 < 200ms\n',
          '- **安全**：密码加密存储\n',
          '\n## 3. 接口需求\n',
          '- POST /api/auth/login\n',
          '- POST /api/auth/register\n',
        ]

        // 构建 SSE 响应体
        const sseBody = chunks.map((c) => `data: ${JSON.stringify({ content: c })}\n\n`).join('') +
          'data: [DONE]\n\n'

        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          headers: {
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
          body: sseBody,
        })
        return
      }

      await route.fallback()
    })
  })

  test('完整流程：上传文档 → AI 分析 → 审阅 → 通过', async ({ page }) => {
    // 1. 导航到 AI 需求分析页面
    await page.goto('/ai-analysis', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'AI 需求分析' })).toBeVisible()

    // 2. 验证初始状态
    await expect(page.getByText('等待上传')).toBeVisible()
    await expect(page.getByText(/等待操作或开始分析/)).toBeVisible()
    await expect(page.getByRole('button', { name: '开始分析' })).toBeDisabled()

    // 3. 上传文件（通过隐藏的 input）
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: '需求文档.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('这是一个测试需求文档'),
    })

    // 4. 等待上传和解析完成
    await expect(page.getByText(/文件上传成功/)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/文档解析完成/)).toBeVisible({ timeout: 10000 })

    // 5. 验证文件已显示在左侧
    await expect(page.getByText('需求文档.txt')).toBeVisible()

    // 6. 验证"开始分析"按钮可点击
    const startBtn = page.getByRole('button', { name: '开始分析' })
    await expect(startBtn).toBeEnabled()

    // 7. 填写补充说明
    await page.getByPlaceholder('在此输入需求背景、业务描述或补充说明...').fill('请重点分析安全需求')

    // 8. 点击开始分析
    await startBtn.click()

    // 9. 验证分析中状态
    await expect(page.getByText(/分析中/)).toBeVisible()
    await expect(page.getByRole('button', { name: '停止分析' })).toBeVisible()
    await expect(page.getByText(/开始需求分析/)).toBeVisible()

    // 10. 等待流式报告出现
    await expect(page.getByText('需求文档分析报告')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('主要功能需求')).toBeVisible()
    await expect(page.getByText('用户登录')).toBeVisible()

    // 11. 等待分析完成 → 进入审阅状态
    await expect(page.getByText('等待审阅')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('人工审阅')).toBeVisible()

    // 12. 验证审阅区域
    const reviewTextarea = page.getByPlaceholder(/请输入修改意见/)
    await expect(reviewTextarea).toBeVisible()
    await expect(page.getByRole('button', { name: /提交修改意见/ })).toBeVisible()
    await expect(page.getByRole('button', { name: '确认通过' })).toBeVisible()

    // 13. 点击确认通过
    await page.getByRole('button', { name: '确认通过' }).click()

    // 14. 验证已通过状态
    await expect(page.getByText('已通过')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('需求分析已通过')).toBeVisible()
  })

  test('初始状态验证：页面元素完整', async ({ page }) => {
    await page.goto('/ai-analysis', { waitUntil: 'networkidle' })

    // 标题
    await expect(page.getByRole('heading', { name: 'AI 需求分析' })).toBeVisible()

    // 模型标签
    await expect(page.getByText(/模型：GPT-4o/)).toBeVisible()

    // 使用说明
    await expect(page.getByText('使用说明')).toBeVisible()

    // 上传区域
    await expect(page.getByText('拖拽文件到此处，或点击选择')).toBeVisible()

    // 补充说明输入框
    await expect(page.getByPlaceholder('在此输入需求背景、业务描述或补充说明...')).toBeVisible()

    // 人工审阅开关
    await expect(page.getByText('人工审阅')).toBeVisible()

    // 终端标题
    await expect(page.getByText('AI 需求分析终端')).toBeVisible()

    // 初始状态标签
    await expect(page.getByText('等待上传')).toBeVisible()
  })

  test('补充说明填写', async ({ page }) => {
    await page.goto('/ai-analysis', { waitUntil: 'networkidle' })

    const textarea = page.getByPlaceholder('在此输入需求背景、业务描述或补充说明...')
    await textarea.fill('这是一个补充说明，描述业务背景')
    await expect(textarea).toHaveValue('这是一个补充说明，描述业务背景')
  })

  test('人工审阅开关切换', async ({ page }) => {
    await page.goto('/ai-analysis', { waitUntil: 'networkidle' })

    const toggle = page.getByRole('switch', { name: '人工审阅' })
    // 默认开启
    await expect(toggle).toHaveAttribute('aria-checked', 'true')

    // 点击关闭
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')

    // 再次点击开启
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  test('上传非解析文件后显示解析等待状态', async ({ page }) => {
    // 覆盖文件上传 mock：返回 PARSING 状态
    await page.unroute('**/*')
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      const p = url.pathname
      const method = route.request().method()

      if (p === '/api/ai/models' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk([{ id: 'm-1', name: 'GPT-4o', provider: 'openai', modelId: 'gpt-4o', isDefault: true }])),
        })
        return
      }

      if (p === '/api/files' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk({ list: [], total: 0, page: 1, pageSize: 20 })),
        })
        return
      }

      // 文件上传返回 PARSING 状态
      if (p === '/api/files/upload' && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk({
            id: 'file-2',
            originalName: '大文档.pdf',
            size: 5242880,
            fileType: 'PDF',
            status: 'PARSING',
          })),
        })
        return
      }

      // 轮询：第一次返回 PARSING，第二次返回 PARSED
      if (p.startsWith('/api/files/') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk({
            id: 'file-2',
            originalName: '大文档.pdf',
            size: 5242880,
            fileType: 'PDF',
            status: 'PARSED',
            parsedContent: 'PDF 文档的解析内容，包含详细的业务需求描述。',
          })),
        })
        return
      }

      await route.fallback()
    })

    await page.goto('/ai-analysis', { waitUntil: 'networkidle' })

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: '大文档.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('PDF content'),
    })

    // 验证解析等待提示（日志文案）
    await expect(page.getByText(/正在等待服务端解析文档/)).toBeVisible({ timeout: 10000 })

    // 等待解析完成
    await expect(page.getByText(/文档解析完成/)).toBeVisible({ timeout: 15000 })
  })
})

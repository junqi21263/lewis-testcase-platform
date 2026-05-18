import { expect, test } from '@playwright/test'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

function apiOk<T>(data: T) {
  return { code: 0, data }
}

async function createMockPdfBuffer(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595.28, 841.89])
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  page.drawText('AI analysis mock PDF upload test', {
    x: 72,
    y: 760,
    size: 18,
    font,
    color: rgb(0.1, 0.1, 0.1),
  })
  page.drawText('Requirement: user can upload a PDF and wait for parsed result.', {
    x: 72,
    y: 720,
    size: 12,
    font,
    color: rgb(0.2, 0.2, 0.2),
  })
  return Buffer.from(await pdfDoc.save())
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
    await expect(page.getByText(/需求解析完成/)).toBeVisible({ timeout: 10000 })

    // 5. 验证文件已显示在左侧（使用精确匹配）
    await expect(page.getByText('需求文档.txt', { exact: true })).toBeVisible()

    // 6. 验证"开始分析"按钮可点击
    const startBtn = page.getByRole('button', { name: '开始分析' })
    await expect(startBtn).toBeEnabled()

    // 7. 填写补充说明
    await page.getByPlaceholder('在此输入需求背景、业务描述或补充说明...').fill('请重点分析安全需求')

    // 8. 点击开始分析
    await startBtn.click()

    // 9. 等待分析开始并显示报告
    await expect(page.getByText(/开始需求分析/)).toBeVisible()

    // 10. 等待流式报告出现
    await expect(page.getByText('需求文档分析报告')).toBeVisible({ timeout: 15000 })
    // 报告区 h2；勿用 getByText('主要功能需求') — Prompt 模板 textarea 内也含该文案
    await expect(page.getByRole('heading', { name: /主要功能需求/ })).toBeVisible()
    await expect(page.getByText('用户登录')).toBeVisible()
    await expect(page.getByRole('button', { name: '生成用例' })).toBeVisible()
    await expect(page.getByRole('button', { name: '导出 PDF' })).toBeVisible()
    await expect(page.getByRole('button', { name: '导出 XMind' })).toBeVisible()

    // 11. 等待分析完成 → 进入审阅状态
    await expect(page.getByText('等待审阅')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('heading', { name: '人工审阅' })).toBeVisible()

    // 12. 验证审阅区域
    const reviewTextarea = page.getByPlaceholder(/请输入修改意见/)
    await expect(reviewTextarea).toBeVisible()
    await expect(page.getByRole('button', { name: /提交修改意见/ })).toBeVisible()
    await expect(page.getByRole('button', { name: '确认通过' })).toBeVisible()

    // 13. 点击确认通过
    await page.getByRole('button', { name: '确认通过' }).click()

    // 14. 验证已通过状态（使用exact精确匹配状态标签）
    await expect(page.getByText('已通过', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('main').getByText('需求分析已通过')).toBeVisible()
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

    // 可编辑分析指令模板
    await expect(page.getByLabel('分析指令模板（Prompt）')).toBeVisible()

    // 人工审阅开关（使用精确匹配）
    await expect(page.getByText('人工审阅', { exact: true })).toBeVisible()

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
    let parseCount = 0  // 移到外部保持状态
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

      // 文件上传返回 PARSING 状态（勿用 .pdf + 5MB：会走 PDF 预处理/分片上传，mock 未覆盖 merge）
      if (p === '/api/files/upload' && method === 'POST') {
        parseCount = 0  // 重置计数
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk({
            id: 'file-2',
            originalName: '大文档.txt',
            size: 4096,
            fileType: 'TEXT',
            status: 'PARSING',
          })),
        })
        return
      }

      // SSE / 解析事件：不计入 parseCount，否则会抢轮询次数导致行为错乱
      if (method === 'GET' && /\/files\/[^/]+\/parse-events$/.test(p)) {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
          body: 'data: {}\n\n',
        })
        return
      }

      // 轮询：先返回几次 PARSING，然后返回 PARSED
      if (p.startsWith('/api/files/') && method === 'GET') {
        parseCount++
        if (parseCount < 3) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(apiOk({
              id: 'file-2',
              originalName: '大文档.txt',
              size: 4096,
              fileType: 'TEXT',
              status: 'PARSING',
            })),
          })
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(apiOk({
              id: 'file-2',
              originalName: '大文档.txt',
              size: 4096,
              fileType: 'TEXT',
              status: 'PARSED',
              parsedContent: '需求解析内容。',
            })),
          })
        }
        return
      }

      await route.fallback()
    })

    await page.goto('/ai-analysis', { waitUntil: 'networkidle' })

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: '大文档.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('plain text content for parse mock'),
    })

    // 验证解析等待提示（日志文案；含 emoji，放宽匹配）
    await expect(page.getByText(/等待服务端解析文档/)).toBeVisible({ timeout: 15000 })

    // 等待解析完成（匹配日志消息中的带勾版本）
    await expect(page.getByText('✅ 解析完成')).toBeVisible({ timeout: 15000 })
  })

  test('上传 mock PDF 时轮询遇到 502 会自动重试并恢复解析结果', async ({ page }) => {
    await page.unroute('**/*')
    let detailPollCount = 0

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

      if (p === '/api/files/upload' && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk({
            id: 'file-pdf-502',
            name: 'file-pdf-502.pdf',
            originalName: 'mock-requirements.pdf',
            size: 2048,
            mimeType: 'application/pdf',
            fileType: 'PDF',
            status: 'PARSING',
            parseStage: 'PDF',
            uploaderId: 'u-1',
            createdAt: '2026-05-15T00:00:00.000Z',
            updatedAt: '2026-05-15T00:00:00.000Z',
          })),
        })
        return
      }

      if (method === 'GET' && p === '/api/files/file-pdf-502/parse-events') {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
          body: 'data: {"status":"PARSING","parseStage":"PDF","parseProgress":null,"parseError":null}\n\n',
        })
        return
      }

      if (p === '/api/files/file-pdf-502' && method === 'GET') {
        detailPollCount++
        if (detailPollCount === 1) {
          await route.fulfill({
            status: 502,
            contentType: 'text/html',
            body: '<html><body><h1>502 Bad Gateway</h1></body></html>',
          })
          return
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk({
            id: 'file-pdf-502',
            name: 'file-pdf-502.pdf',
            originalName: 'mock-requirements.pdf',
            size: 2048,
            mimeType: 'application/pdf',
            fileType: 'PDF',
            status: 'PARSED',
            parseStage: 'DONE',
            parsedContent: 'Mock PDF parsed requirement: 用户可以上传 PDF 并等待解析结果。',
            structuredRequirements: ['用户可以上传 PDF 并等待解析结果'],
            uploaderId: 'u-1',
            createdAt: '2026-05-15T00:00:00.000Z',
            updatedAt: '2026-05-15T00:00:02.000Z',
          })),
        })
        return
      }

      await route.fallback()
    })

    await page.goto('/ai-analysis', { waitUntil: 'networkidle' })

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'mock-requirements.pdf',
      mimeType: 'application/pdf',
      buffer: await createMockPdfBuffer(),
    })

    await expect(page.getByText(/文件上传成功/)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/解析状态接口暂时不可用（HTTP 502）/)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/解析状态连接已恢复/)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/解析完成/)).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: '开始分析' })).toBeEnabled()
  })
})

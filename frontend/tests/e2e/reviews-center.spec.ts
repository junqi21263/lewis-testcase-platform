import { expect, test } from '@playwright/test'
import { getLiveLoginCredentials } from './support/liveCredentials'

const RECORD_ID = 'rec-review-1'
const CASE_ID = 'case-review-1'
const SUITE_ID = 'suite-review-1'

function apiOk<T>(data: T) {
  return { code: 0, message: 'ok', data, timestamp: new Date().toISOString() }
}

const mockSnapshot = {
  title: '登录用例',
  priority: 'P1',
  type: 'FUNCTIONAL',
  tags: ['auth'],
  precondition: '已有账号',
  steps: [{ order: 1, action: '输入账号密码', expected: '登录成功' }],
  expectedResults: ['进入首页'],
  expectedResult: '[1] 进入首页',
  remarks: '',
}

test.describe('用例评审中心', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
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

    let versionNum = 1
    const comments: {
      id: string
      commentType: string
      content: string
      authorName: string
      createdAt: string
    }[] = []

    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      const p = url.pathname
      if (!p.startsWith('/api/')) {
        await route.continue()
        return
      }
      const method = route.request().method()

      if (p === '/api/records' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              list: [
                {
                  id: RECORD_ID,
                  title: 'E2E 评审记录',
                  status: 'SUCCESS',
                  reviewStatus: 'pending_review',
                  sourceType: 'text',
                  prompt: '测试',
                  modelId: 'm-1',
                  modelName: 'Mock',
                  caseCount: 1,
                  suiteId: SUITE_ID,
                  creatorId: 'u-1',
                  createdAt: '2026-05-21T10:00:00.000Z',
                  updatedAt: '2026-05-21T10:00:00.000Z',
                },
              ],
              total: 1,
              page: 1,
              pageSize: 10,
            }),
          ),
        })
        return
      }

      if (p === `/api/reviews/records/${RECORD_ID}/workspace`) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              record: {
                id: RECORD_ID,
                title: 'E2E 评审记录',
                status: 'SUCCESS',
                reviewStatus: 'pending_review',
                caseCount: 1,
                suiteId: SUITE_ID,
                modelName: 'Mock',
                sourceType: 'text',
                createdAt: '2026-05-21T10:00:00.000Z',
                updatedAt: '2026-05-21T10:00:00.000Z',
                creator: { id: 'u-1', username: 'tester' },
                suite: { id: SUITE_ID, name: '评审套件' },
              },
              summary: { status: 'pending_review', counts: { pending_review: 1 } },
              cases: [
                {
                  id: CASE_ID,
                  title: mockSnapshot.title,
                  priority: 'P1',
                  type: 'FUNCTIONAL',
                  tags: ['auth'],
                  reviewStatus: 'pending_review',
                  currentVersionNumber: versionNum,
                  latestComment: null,
                  reviewedAt: null,
                  reviewId: 'rev-1',
                  updatedAt: '2026-05-21T10:00:00.000Z',
                },
              ],
            }),
          ),
        })
        return
      }

      if (p === `/api/reviews/records/${RECORD_ID}/cases/${CASE_ID}` && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({
              case: { id: CASE_ID, title: mockSnapshot.title },
              review: { caseId: CASE_ID, reviewStatus: 'pending_review' },
              snapshot: mockSnapshot,
              comments: [...comments],
            }),
          ),
        })
        return
      }

      if (p === `/api/reviews/records/${RECORD_ID}/cases/${CASE_ID}` && method === 'PATCH') {
        versionNum += 1
        const body = route.request().postDataJSON() as typeof mockSnapshot
        Object.assign(mockSnapshot, body)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk({ case: { id: CASE_ID, title: body.title }, versionNumber: versionNum }),
          ),
        })
        return
      }

      if (p === `/api/reviews/records/${RECORD_ID}/cases/${CASE_ID}/status` && method === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk({ ok: true })),
        })
        return
      }

      if (p === `/api/reviews/cases/${CASE_ID}/versions`) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk([
              {
                id: 'ver-2',
                caseId: CASE_ID,
                recordId: RECORD_ID,
                versionNumber: versionNum,
                sourceType: 'manual_edit',
                changeSummary: '人工编辑保存',
                createdBy: 'u-1',
                authorName: 'tester',
                createdAt: '2026-05-21T10:05:00.000Z',
              },
              {
                id: 'ver-1',
                caseId: CASE_ID,
                recordId: RECORD_ID,
                versionNumber: 1,
                sourceType: 'generate',
                changeSummary: 'AI 生成初始版本',
                createdBy: 'u-1',
                authorName: 'tester',
                createdAt: '2026-05-21T10:00:00.000Z',
              },
            ]),
          ),
        })
        return
      }

      if (p === `/api/reviews/cases/${CASE_ID}/diff`) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            apiOk([
              {
                field: 'title',
                label: '标题',
                before: '登录用例',
                after: '登录用例-已编辑',
                changed: true,
              },
            ]),
          ),
        })
        return
      }

      if (
        p === `/api/reviews/records/${RECORD_ID}/cases/${CASE_ID}/comments` &&
        method === 'POST'
      ) {
        const body = route.request().postDataJSON() as { content: string }
        comments.unshift({
          id: 'cm-1',
          commentType: 'note',
          content: body.content,
          authorName: 'tester',
          createdAt: '2026-05-21T10:06:00.000Z',
        })
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk(comments[0])),
        })
        return
      }

      if (p === '/api/records/summary') {
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

      if (p === '/api/records/meta/models') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk([])),
        })
        return
      }

      if (p.startsWith('/api/settings/') || p.startsWith('/api/usage/')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(apiOk({})),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(apiOk(null)),
      })
    })
  })

  test('生成记录可进入评审并展示工作区', async ({ page }) => {
    await page.goto('/records', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('E2E 评审记录')).toBeVisible({ timeout: 15_000 })

    await page.getByTitle('进入评审').click()
    await expect(page).toHaveURL(new RegExp(`/reviews/${RECORD_ID}`))
    await expect(page.getByRole('heading', { name: 'E2E 评审记录' })).toBeVisible()
    await expect(page.getByLabel('标题 *')).toHaveValue('登录用例')
  })

  test('结构化编辑保存', async ({ page }) => {
    await page.goto(`/reviews/${RECORD_ID}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('标题 *')).toBeVisible({ timeout: 15_000 })

    await page.getByLabel('标题 *').fill('登录用例-已编辑')
    await expect(page.getByText('· 未保存')).toBeVisible()
    await page.getByTestId('review-save-btn').click()
    await expect(page.getByText(/已保存为 v\d+/)).toBeVisible({ timeout: 10_000 })
  })

  test('版本侧栏与 diff', async ({ page }) => {
    await page.goto(`/reviews/${RECORD_ID}`, { waitUntil: 'domcontentloaded' })
    const toolbar = page.getByTestId('review-detail-toolbar')
    await toolbar.getByTestId('review-versions-btn').click()
    await expect(page.getByRole('heading', { name: '版本历史' })).toBeVisible()
    await page.getByRole('button', { name: '对比' }).first().click()
    await expect(page.getByRole('heading', { name: '版本对比' })).toBeVisible()
    await page.getByRole('button', { name: '关闭', exact: true }).click()
  })

  test('提交评论', async ({ page }) => {
    await page.goto(`/reviews/${RECORD_ID}`, { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('填写评论或修改建议…').fill('需要补充边界用例')
    await page.getByRole('button', { name: '提交评论' }).click()
    await expect(page.getByText('需要补充边界用例')).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('用例评审中心 @live', () => {
  test.skip(!process.env.E2E_LIVE, '设置 E2E_LIVE=1 且后端已启动时运行')

  test('真实 API 联调：数据库测试账号可登录并进入工作台', async ({ page }) => {
    const credentials = getLiveLoginCredentials()

    await page.goto('/login')
    await page.locator('#login-username').fill(credentials.login)
    await page.locator('#login-password').fill(credentials.password)
    await page.getByRole('button', { name: /登录/ }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 })
    await expect(page.getByText(new RegExp(`欢迎回来，${credentials.username}`))).toBeVisible({
      timeout: 15_000,
    })
  })

  test('真实 API 联调：评审工作区可加载', async ({ page }) => {
    const recordId = process.env.E2E_REVIEW_RECORD_ID
    test.skip(!recordId, '需要 E2E_REVIEW_RECORD_ID')
    const credentials = getLiveLoginCredentials()

    await page.goto('/login')
    await page.locator('#login-username').fill(credentials.login)
    await page.locator('#login-password').fill(credentials.password)
    await page.getByRole('button', { name: /登录/ }).click()
    await page.waitForURL(/\/(dashboard|records|generate)/, { timeout: 15_000 })

    await page.goto(`/reviews/${recordId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('标题 *')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('review-save-btn')).toBeVisible()
  })
})

import { expect, test } from '@playwright/test'

const captchaSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><text x="10" y="25">a7k9</text></svg>'

function apiResponse<T>(data: T) {
  return {
    code: 200,
    message: 'ok',
    data,
    timestamp: new Date().toISOString(),
  }
}

test.describe('邮箱注册登录：邀请码与图形验证码', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.route('**/api/auth/captcha**', async (route) => {
      const url = new URL(route.request().url())
      const action = url.searchParams.get('action') || 'login'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          apiResponse({
            captchaId: `${action}-captcha-id`,
            imageSvg: captchaSvg,
            expiresInSec: 300,
          }),
        ),
      })
    })
  })

  test('登录页展示邀请注册入口并可跳转注册页', async ({ page }) => {
    await page.goto('/login')

    const registerLink = page.getByRole('link', { name: /邀请码注册|创建账号|注册/ })
    await expect(registerLink).toBeVisible()
    await registerLink.click()

    await expect(page).toHaveURL(/\/register$/)
    await expect(page.getByRole('heading', { name: '创建新账号' })).toBeVisible()
  })

  test('注册第一步必须提交邮箱、邀请码、图形验证码和确认密码', async ({ page }) => {
    let requestBody: Record<string, unknown> | null = null
    await page.route('**/api/auth/register/send-code', async (route) => {
      requestBody = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          apiResponse({
            email: 'friend@example.com',
            mailConfigured: true,
            mailIssues: [],
          }),
        ),
      })
    })

    await page.goto('/register')
    await expect(page.getByRole('heading', { name: '创建新账号' })).toBeVisible()

    await page.getByPlaceholder('请输入邮箱地址').fill('friend@example.com')
    await page.getByPlaceholder('请输入密码').fill('Friend@123456')
    await page.getByPlaceholder('请再次输入密码').fill('Friend@123456')
    await page.getByPlaceholder('输入图中字符').fill('a7k9')
    await page.getByPlaceholder('请输入邀请码').fill('0628')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: '发送验证码' }).click()

    await expect(page.getByText(/我们已向 friend@example.com 发送 6 位验证码/)).toBeVisible()
    expect(requestBody).toMatchObject({
      email: 'friend@example.com',
      password: 'Friend@123456',
      confirmPassword: 'Friend@123456',
      inviteCode: '0628',
      captchaId: 'register-captcha-id',
      captchaCode: 'a7k9',
    })
    expect(requestBody).not.toHaveProperty('username')
  })

  test('登录必须提交已注册邮箱和图形验证码', async ({ page }) => {
    let requestBody: Record<string, unknown> | null = null
    await page.route('**/api/auth/login', async (route) => {
      requestBody = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          apiResponse({
            accessToken: 'token-for-e2e',
            user: {
              id: 'u-1',
              email: 'friend@example.com',
              username: 'friend',
              role: 'ADMIN',
              emailVerified: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
        ),
      })
    })

    await page.goto('/login')
    await page.locator('#login-username').fill('friend@example.com')
    await page.locator('#login-password').fill('Friend@123456')
    await page.locator('#login-captcha').fill('a7k9')
    await page.getByRole('button', { name: '登录' }).click()

    await page.waitForURL(/\/dashboard/)
    expect(requestBody).toMatchObject({
      email: 'friend@example.com',
      password: 'Friend@123456',
      captchaId: 'login-captcha-id',
      captchaCode: 'a7k9',
    })
    expect(requestBody).not.toHaveProperty('username')
  })
})

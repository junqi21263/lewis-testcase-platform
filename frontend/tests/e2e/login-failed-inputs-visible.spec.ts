import { expect, test } from '@playwright/test'

test.describe('Login: wrong password keeps inputs visible', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.route('**/api/auth/captcha**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: 'ok',
          data: {
            captchaId: 'captcha-login-1',
            imageSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><text x="10" y="25">a7k9</text></svg>',
            expiresInSec: 300,
          },
          timestamp: new Date().toISOString(),
        }),
      })
    })
    await page.route('**/api/auth/login', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: '用户名或密码错误' }),
      })
    })
  })

  test('username and password fields stay visible and editable after failed login', async ({ page }) => {
    await page.goto('/login')
    const user = page.locator('#login-username')
    const pwd = page.locator('#login-password')
    const captcha = page.locator('#login-captcha')
    await expect(user).toBeVisible()
    await expect(pwd).toBeVisible()
    await expect(captcha).toBeVisible()

    await user.fill('friend@example.com')
    await pwd.fill('wrongpass1')
    await captcha.fill('a7k9')
    await page.getByRole('button', { name: '登录' }).click()

    await expect(page.getByRole('alert')).toBeVisible()
    await expect(user).toBeVisible()
    await expect(pwd).toBeVisible()
    await expect(user).toBeEditable()
    await expect(pwd).toBeEditable()
    await expect(user).toHaveValue('friend@example.com')
    await expect(pwd).toHaveValue('wrongpass1')

    await pwd.fill('wrongpass2')
    await captcha.fill('a7k9')
    await page.getByRole('button', { name: '登录' }).click()
    await expect(pwd).toBeVisible()
    await expect(pwd).toHaveValue('wrongpass2')
  })
})

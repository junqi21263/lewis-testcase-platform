import { expect, test } from '@playwright/test'

test.describe('Login: wrong password keeps inputs visible', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
      sessionStorage.clear()
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
    await expect(user).toBeVisible()
    await expect(pwd).toBeVisible()

    await user.fill('testuser')
    await pwd.fill('wrongpass1')
    await page.getByRole('button', { name: '登录' }).click()

    await expect(page.getByRole('alert')).toBeVisible()
    await expect(user).toBeVisible()
    await expect(pwd).toBeVisible()
    await expect(user).toBeEditable()
    await expect(pwd).toBeEditable()
    await expect(user).toHaveValue('testuser')
    await expect(pwd).toHaveValue('wrongpass1')

    await pwd.fill('wrongpass2')
    await page.getByRole('button', { name: '登录' }).click()
    await expect(pwd).toBeVisible()
    await expect(pwd).toHaveValue('wrongpass2')
  })
})

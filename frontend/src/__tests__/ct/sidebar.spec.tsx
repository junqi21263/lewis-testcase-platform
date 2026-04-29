import { test, expect } from '@playwright/experimental-ct-react'
import { SidebarStory } from '@/__tests__/ct/stories/sidebar.story'

test.describe('Sidebar', () => {
  test('shows brand title and workbench nav', async ({ mount }) => {
    const c = await mount(<SidebarStory />)
    await expect(c.getByText('AI 用例平台')).toBeVisible()
    await expect(c.getByRole('link', { name: '工作台' })).toBeVisible()
    await expect(c.getByRole('link', { name: '系统设置' })).toBeVisible()
  })

  test('collapse button toggles sidebar width classes', async ({ mount, page }) => {
    await mount(<SidebarStory />)
    const aside = page.locator('aside').first()
    await expect(aside).toBeVisible()
    await expect(aside).toHaveClass(/w-60/)
    await page.getByRole('button', { name: '收起侧边栏' }).click()
    await expect(aside).toHaveClass(/w-16/)
    await page.getByRole('button', { name: '展开侧边栏' }).click()
    await expect(aside).toHaveClass(/w-60/)
  })
})

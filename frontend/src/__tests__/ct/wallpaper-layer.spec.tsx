import { test, expect } from '@playwright/experimental-ct-react'
import { WallpaperLayerStory } from '@/__tests__/ct/stories/wallpaper-layer.story'

const tinyPngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X8Yb8AAAAASUVORK5CYII='

test.describe('WallpaperLayer', () => {
  test('normal: enabled -> loads and applies wallpaper background', async ({ mount, page }) => {
    page.on('pageerror', (err) => {
      // eslint-disable-next-line no-console
      console.error('[ct pageerror]', err)
    })
    page.on('console', (msg) => {
      // eslint-disable-next-line no-console
      console.log('[ct console]', msg.type(), msg.text())
    })
    // data: URL 避免依赖对 example.com 的网络拦截，preloadImage 在 CT 中更稳定
    const imgUrl = `data:image/png;base64,${tinyPngBase64}`

    await page.route('**/api/preferences/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          data: {
            wallpaperEnabled: true,
            wallpaperIntervalSec: 0,
            wallpaperCurrentUrl: null,
          },
        }),
      })
    })
    await page.route('**/api/wallpaper/next*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          data: { enabled: true, url: imgUrl, rotated: true },
        }),
      })
    })

    await mount(<WallpaperLayerStory />)

    // fixed 全屏层用 page 级定位更稳（避免 component 子树对 internal:control 的裁剪差异）
    const bg = page.locator('div.pointer-events-none.fixed.inset-0.z-0')
    await expect(bg).toBeVisible({ timeout: 10_000 })

    const imageDiv = bg.locator('div').first()
    await expect(imageDiv).toHaveCSS('background-image', /data:image\/png/)
  })

  test('edge: disabled -> renders nothing', async ({ mount, page }) => {
    page.on('pageerror', (err) => {
      // eslint-disable-next-line no-console
      console.error('[ct pageerror]', err)
    })
    await page.route('**/api/preferences/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          data: { wallpaperEnabled: false, wallpaperIntervalSec: 0, wallpaperCurrentUrl: null },
        }),
      })
    })

    const component = await mount(<WallpaperLayerStory />)
    await expect(component.locator('div.pointer-events-none.fixed.inset-0.z-0')).toHaveCount(0)
  })

  test('edge: enabled but API returns disabled -> renders nothing', async ({ mount, page }) => {
    page.on('pageerror', (err) => {
      // eslint-disable-next-line no-console
      console.error('[ct pageerror]', err)
    })
    await page.route('**/api/preferences/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          data: { wallpaperEnabled: true, wallpaperIntervalSec: 0, wallpaperCurrentUrl: null },
        }),
      })
    })
    await page.route('**/api/wallpaper/next*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: { enabled: false, url: null } }),
      })
    })

    const component = await mount(<WallpaperLayerStory />)
    await expect(component.locator('div.pointer-events-none.fixed.inset-0.z-0')).toHaveCount(0)
  })

  test('exception: wallpaper API fails -> keeps UI stable (no crash)', async ({ mount, page }) => {
    page.on('pageerror', (err) => {
      // eslint-disable-next-line no-console
      console.error('[ct pageerror]', err)
    })
    await page.route('**/api/preferences/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          data: { wallpaperEnabled: true, wallpaperIntervalSec: 0, wallpaperCurrentUrl: null },
        }),
      })
    })
    await page.route('**/api/wallpaper/next*', async (route) => {
      await route.fulfill({ status: 500, body: 'fail' })
    })

    const component = await mount(<WallpaperLayerStory />)
    await expect(component.locator('div.pointer-events-none.fixed.inset-0.z-0')).toHaveCount(0)
  })
})


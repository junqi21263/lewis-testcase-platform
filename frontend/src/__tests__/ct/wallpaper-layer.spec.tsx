import { test, expect } from '@playwright/experimental-ct-react'
import { WallpaperLayerStory } from '@/__tests__/ct/stories/wallpaper-layer.story'

const tinyPngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X8Yb8AAAAASUVORK5CYII='

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

test.describe('WallpaperLayer', () => {
  test('normal: enabled -> loads and applies wallpaper background', async ({ mount, page }) => {
    const imgUrl = 'https://example.com/wallpaper.png'

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
    await page.route('**/wallpaper.png', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: base64ToUint8Array(tinyPngBase64),
      })
    })

    const component = await mount(<WallpaperLayerStory />)

    const bg = component.locator('div.fixed.inset-0.-z-10')
    await expect(bg).toBeVisible()

    const imageDiv = bg.locator('div').first()
    await expect(imageDiv).toHaveCSS('background-image', /wallpaper\.png/)
  })

  test('edge: disabled -> renders nothing', async ({ mount, page }) => {
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
    await expect(component.locator('div.fixed.inset-0.-z-10')).toHaveCount(0)
  })

  test('edge: enabled but API returns disabled -> renders nothing', async ({ mount, page }) => {
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
    await expect(component.locator('div.fixed.inset-0.-z-10')).toHaveCount(0)
  })

  test('exception: wallpaper API fails -> keeps UI stable (no crash)', async ({ mount, page }) => {
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
    await expect(component.locator('div.fixed.inset-0.-z-10')).toHaveCount(0)
  })
})


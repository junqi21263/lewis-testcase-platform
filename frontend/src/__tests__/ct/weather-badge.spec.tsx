import { test, expect } from '@playwright/experimental-ct-react'
import { WeatherBadgeStory } from '@/__tests__/ct/stories/weather-badge.story'

test.describe('WeatherBadge', () => {
  test('normal: shows city + temperature + text, and navigates on click', async ({
    mount,
    page,
  }) => {
    await page.route('**/api/preferences/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          data: {
            weatherCityId: '39.9042,116.4074',
            weatherCityName: '北京',
            weatherCityAdm1: '北京市',
          },
        }),
      })
    })
    await page.route('**/api/weather/current*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          data: {
            locationId: '39.9042,116.4074',
            updateTime: '2026-04-28T00:00',
            obsTime: '2026-04-28T00:00',
            temp: 25,
            feelsLike: 26,
            text: '多云',
            icon: 'cloud',
            windDir: null,
            windScale: null,
            humidity: 30,
            stale: false,
          },
        }),
      })
    })

    const component = await mount(<WeatherBadgeStory />)

    await expect(component.getByText('北京')).toBeVisible()
    await expect(component.getByText(/25°/)).toBeVisible()
    await expect(component.getByText(/多云/)).toBeVisible()

    await component.click()
    await expect(page.getByTestId('settings-page')).toBeVisible()
  })

  test('edge: no cityId -> shows prompt to set city', async ({ mount, page }) => {
    await page.route('**/api/preferences/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          data: {
            weatherCityId: null,
            weatherCityName: null,
            weatherCityAdm1: null,
          },
        }),
      })
    })

    const component = await mount(<WeatherBadgeStory />)
    await expect(component.getByText('未设置城市')).toBeVisible()
    await expect(component.getByText('点击设置')).toBeVisible()
  })

  test('edge: stale weather -> renders muted style', async ({ mount, page }) => {
    await page.route('**/api/preferences/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          data: {
            weatherCityId: '39.9042,116.4074',
            weatherCityName: '北京',
          },
        }),
      })
    })
    await page.route('**/api/weather/current*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          data: {
            locationId: '39.9042,116.4074',
            updateTime: null,
            obsTime: null,
            temp: 18,
            feelsLike: 18,
            text: '小雨',
            icon: 'rain',
            windDir: null,
            windScale: null,
            humidity: 70,
            stale: true,
          },
        }),
      })
    })

    const component = await mount(<WeatherBadgeStory />)
    const textNode = component.getByText(/18°/)
    await expect(textNode).toHaveClass(/text-muted-foreground/)
  })

  test('exception: weather api fails -> keeps UI stable (no crash)', async ({ mount, page }) => {
    await page.route('**/api/preferences/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          data: {
            weatherCityId: '39.9042,116.4074',
            weatherCityName: '北京',
          },
        }),
      })
    })
    await page.route('**/api/weather/current*', async (route) => {
      await route.fulfill({ status: 500, body: 'fail' })
    })

    const component = await mount(<WeatherBadgeStory />)
    await expect(component.getByText('北京')).toBeVisible()
    await expect(component.getByText('加载中')).toBeVisible()
  })
})


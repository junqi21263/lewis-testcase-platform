import { expect, test } from '@playwright/experimental-ct-react'
import {
  SafeMermaidRendererStory,
  StreamingMermaidStory,
} from '@/__tests__/ct/stories/safe-mermaid-renderer.story'

test.describe('SafeMermaidRenderer', () => {
  test('renders normalized AI flowchart syntax in a browser', async ({
    mount,
  }) => {
    const component = await mount(<SafeMermaidRendererStory />)
    await expect(
      component.locator('button[title="点击放大查看流程图"] svg'),
    ).toBeVisible({ timeout: 10_000 })
    await expect(component.locator('svg text')).toContainText(
      ['提交(移动端, iOS)', '是否成功?', '失败(网络异常)'],
      { timeout: 10_000 },
    )
    await expect(component.getByText('流程图暂时无法渲染')).toHaveCount(0)
  })

  test('keeps layout height stable while streaming an incomplete update', async ({
    mount,
    page,
  }) => {
    const component = await mount(<StreamingMermaidStory />)
    const chart = component.locator('button[title="点击放大查看流程图"]')

    await expect(chart.locator('svg')).toBeVisible({ timeout: 10_000 })
    const before = await chart.evaluate(
      (node) => node.getBoundingClientRect().height,
    )

    await page.waitForTimeout(1_500)
    const after = await chart.evaluate(
      (node) => node.getBoundingClientRect().height,
    )

    expect(after).toBeGreaterThanOrEqual(Math.min(before, 180))
    await expect(chart.locator('svg')).toBeVisible()
  })
})

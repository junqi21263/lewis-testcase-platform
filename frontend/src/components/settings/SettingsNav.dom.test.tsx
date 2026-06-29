// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SettingsNav } from './SettingsNav'
import type { SettingsNavItem } from '@/utils/settingsUi'

describe('SettingsNav', () => {
  it('filters hidden sections and notifies selection from button and select', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const items: SettingsNavItem[] = [
      { id: 'section-profile', label: '个人资料' },
      { id: 'section-runtime', label: '运行环境' },
      { id: 'section-hidden', label: '隐藏项', show: false },
    ]

    render(<SettingsNav items={items} activeId="section-profile" onSelect={onSelect} />)

    expect(screen.queryByText('隐藏项')).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: '运行环境' })[0]!)
    expect(onSelect).toHaveBeenLastCalledWith('section-runtime')

    await user.selectOptions(screen.getByRole('combobox'), 'section-profile')
    expect(onSelect).toHaveBeenLastCalledWith('section-profile')
  })
})

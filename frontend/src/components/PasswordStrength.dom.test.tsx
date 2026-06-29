// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PasswordStrength } from './PasswordStrength'

describe('PasswordStrength', () => {
  it('marks password rules and strength in real time', () => {
    const { rerender } = render(<PasswordStrength password="Abc123!" />)

    expect(screen.getByTestId('password-strength-label')).toHaveTextContent('密码强度：强')
    expect(screen.getByTestId('password-rule-length')).toHaveAttribute('data-valid', 'true')
    expect(screen.getByTestId('password-rule-symbol')).toHaveAttribute('data-valid', 'true')

    rerender(<PasswordStrength password="abc" />)
    expect(screen.getByTestId('password-strength-label')).toHaveTextContent('密码强度：弱')
    expect(screen.getByTestId('password-rule-uppercase')).toHaveAttribute('data-valid', 'false')
  })
})

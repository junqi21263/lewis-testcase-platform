// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/components/auth/LoginAmbientCanvas', () => ({
  LoginAmbientCanvas: () => null,
}))

vi.mock('@/components/auth/LoginBrandIcon', () => ({
  LoginBrandIcon: () => <div data-testid="login-brand-icon" />,
}))

vi.mock('@/components/auth/LoginMascotStageDecor', () => ({
  LoginMascotStageDecor: () => <div data-testid="login-stage-decor" />,
}))

vi.mock('@/components/auth/LoginMascot', () => ({
  LoginMascot: () => <div data-testid="login-mascot" />,
}))

vi.mock('@/components/auth/LoginThemeToggle', () => ({
  LoginThemeToggle: () => <button type="button">theme</button>,
}))

vi.mock('@/api/auth', () => ({
  authApi: {
    getCaptcha: vi.fn(),
    login: vi.fn(),
    sendRegisterCode: vi.fn(),
    confirmRegister: vi.fn(),
    resendRegisterCode: vi.fn(),
  },
}))

function renderAt(pathname: '/login' | '/register') {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      rememberMe: false,
      loading: false,
      error: null,
      successMessage: null,
    })
    useThemeStore.setState({ theme: 'dark' })
    useAuthStore.persist.hasHydrated = () => true
    ;(authApi.getCaptcha as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      captchaId: 'captcha-1',
      imageSvg: '<svg></svg>',
      expiresInSec: 60,
    })
    ;(authApi.sendRegisterCode as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: 'new@example.com',
      mailConfigured: true,
    })
  })

  it('shows register flow, updates password strength and advances to email code step', async () => {
    const user = userEvent.setup()
    renderAt('/register')

    await screen.findByText('创建新账号')
    expect(authApi.getCaptcha).toHaveBeenCalledWith('register')

    await user.type(screen.getByLabelText('邮箱'), 'new@example.com')
    await user.type(screen.getByLabelText('密码'), 'Abc123!')
    await user.type(screen.getByLabelText('确认密码'), 'Abc123!')
    await user.type(screen.getByLabelText('图形验证码'), 'abcd')
    await user.type(screen.getByLabelText('邀请码'), '0628')

    expect(screen.getByTestId('password-strength-label')).toHaveTextContent('密码强度：强')

    await user.click(screen.getByRole('button', { name: /发送验证码/i }))

    await waitFor(() => {
      expect(authApi.sendRegisterCode).toHaveBeenCalled()
    })
    expect(await screen.findByText('验证邮箱')).toBeInTheDocument()
    expect(screen.getByText(/我们已向 new@example.com 发送 6 位验证码/)).toBeInTheDocument()
  })
})

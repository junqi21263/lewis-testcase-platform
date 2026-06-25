import * as bcrypt from 'bcryptjs'
import { BadRequestException } from '@nestjs/common'
import { EmailOtpPurpose, UserRole } from '@prisma/client'
import { createHash } from 'node:crypto'
import { AuthService } from '@/modules/auth/auth.service'
import { CaptchaService } from '@/modules/auth/captcha.service'
import { PasswordValidator } from '@/common/validators/password.validator'

const validInviteCodeHash = createHash('sha256').update('0628').digest('hex')

function createPrismaMock() {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
    emailOtpChallenge: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 'otp-1' }),
      update: jest.fn(),
      delete: jest.fn(),
    },
    inviteCode: {
      findFirst: jest.fn(async ({ where }: { where: { codeHash?: string } }) =>
        where.codeHash === validInviteCodeHash
          ? {
              id: 'invite-0628',
              codeHash: validInviteCodeHash,
              status: 'ACTIVE',
              maxUses: null,
              usedCount: 0,
              expiresAt: null,
              lastUsedAt: null,
            }
          : null,
      ),
      findUnique: jest.fn().mockResolvedValue({
        id: 'invite-0628',
        codeHash: validInviteCodeHash,
        status: 'ACTIVE',
        maxUses: null,
        usedCount: 0,
        expiresAt: null,
        lastUsedAt: null,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (fnOrOps: any) => {
      if (typeof fnOrOps === 'function') return fnOrOps(prisma)
      return Promise.all(fnOrOps)
    }),
  }
  return prisma
}

function createAuthService(options?: { captchaValid?: boolean; mailReady?: boolean }) {
  const prisma = createPrismaMock()
  const jwt = { sign: jest.fn().mockReturnValue('jwt-token') }
  const mail = {
    getMailTransportReadiness: jest.fn().mockReturnValue(
      options?.mailReady === false
        ? { ready: false, issues: ['未设置 MAIL_HOST 或 SMTP_HOST'] }
        : { ready: true, issues: [] },
    ),
    sendMail: jest.fn().mockResolvedValue({ skipped: false, messageId: 'mail-1' }),
  }
  const captcha = {
    create: jest.fn(),
    validateAndConsume: jest.fn().mockResolvedValue(options?.captchaValid ?? true),
  }
  const service = new AuthService(
    prisma,
    jwt as any,
    new PasswordValidator(),
    mail as any,
    captcha as unknown as CaptchaService,
  )
  return { service, prisma, jwt, mail, captcha }
}

describe('AuthService captcha and invite gate', () => {
  const validRegisterPayload = {
    email: 'friend@example.com',
    password: 'Friend@123456',
    confirmPassword: 'Friend@123456',
    inviteCode: '0628',
    captchaId: 'cap-1',
    captchaCode: 'a7k9',
  }

  beforeEach(() => {
    process.env.AUTH_ADMIN_ONLY = 'false'
  })

  afterEach(() => {
    delete process.env.AUTH_ADMIN_ONLY
    jest.restoreAllMocks()
  })

  it('rejects registration before email OTP when invite code is not active in DB', async () => {
    const { service, prisma, captcha, mail } = createAuthService()

    await expect(
      service.registerSendCode({
        ...validRegisterPayload,
        inviteCode: '1111',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)

    expect(captcha.validateAndConsume).not.toHaveBeenCalled()
    expect(prisma.emailOtpChallenge.upsert).not.toHaveBeenCalled()
    expect(mail.sendMail).not.toHaveBeenCalled()
  })

  it('rejects registration before email OTP when captcha is invalid', async () => {
    const { service, prisma, captcha, mail } = createAuthService({ captchaValid: false })

    await expect(service.registerSendCode(validRegisterPayload)).rejects.toThrow('图形验证码')

    expect(captcha.validateAndConsume).toHaveBeenCalledWith('register', 'cap-1', 'a7k9')
    expect(prisma.emailOtpChallenge.upsert).not.toHaveBeenCalled()
    expect(mail.sendMail).not.toHaveBeenCalled()
  })

  it('does not consume captcha or create OTP when mail transport is not configured', async () => {
    const { service, prisma, captcha, mail } = createAuthService({ mailReady: false })

    const result = await service.registerSendCode(validRegisterPayload)

    expect(result.data).toMatchObject({
      email: 'friend@example.com',
      mailConfigured: false,
      mailIssues: ['未设置 MAIL_HOST 或 SMTP_HOST'],
    })
    expect(captcha.validateAndConsume).not.toHaveBeenCalled()
    expect(prisma.emailOtpChallenge.upsert).not.toHaveBeenCalled()
    expect(mail.sendMail).not.toHaveBeenCalled()
  })

  it('stores pending email registration after invite and captcha pass without requiring username', async () => {
    const { service, prisma, captcha, mail } = createAuthService()

    await service.registerSendCode(validRegisterPayload)

    expect(captcha.validateAndConsume).toHaveBeenCalledWith('register', 'cap-1', 'a7k9')
    expect(prisma.emailOtpChallenge.upsert).toHaveBeenCalledWith({
      where: { email_purpose: { email: 'friend@example.com', purpose: EmailOtpPurpose.REGISTER } },
      create: expect.objectContaining({
        email: 'friend@example.com',
        purpose: EmailOtpPurpose.REGISTER,
        username: expect.stringMatching(/^friend/),
        passwordHash: expect.stringMatching(/^\$2/),
        inviteCodeId: 'invite-0628',
      }),
      update: expect.objectContaining({
        username: expect.stringMatching(/^friend/),
        passwordHash: expect.stringMatching(/^\$2/),
        inviteCodeId: 'invite-0628',
      }),
    })
    expect(JSON.stringify(prisma.emailOtpChallenge.upsert.mock.calls[0][0])).not.toContain('Friend@123456')
    expect(mail.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'friend@example.com' }))
  })

  it('requires captcha for email login', async () => {
    const { service, prisma, captcha } = createAuthService({ captchaValid: false })
    prisma.user.findUnique.mockImplementation(async ({ where }: { where: { email?: string; username?: string } }) =>
      where.email === 'friend@example.com'
        ? {
            id: 'user-1',
            email: 'friend@example.com',
            username: 'friend',
            password: await bcrypt.hash('Friend@123456', 10),
            role: UserRole.MEMBER,
            emailVerified: true,
          }
        : null,
    )

    await expect(
      service.login({
        email: 'friend@example.com',
        password: 'Friend@123456',
        captchaId: 'cap-1',
        captchaCode: 'wrong',
      }),
    ).rejects.toThrow('图形验证码')

    expect(captcha.validateAndConsume).toHaveBeenCalledWith('login', 'cap-1', 'wrong')
  })

  it('logs in with registered email when captcha and password are valid', async () => {
    const { service, prisma, captcha, jwt } = createAuthService()
    const password = await bcrypt.hash('Friend@123456', 10)
    prisma.user.findUnique.mockImplementation(async ({ where }: { where: { email?: string; username?: string } }) =>
      where.email === 'friend@example.com'
        ? {
            id: 'user-1',
            email: 'friend@example.com',
            username: 'friend',
            password,
            role: UserRole.MEMBER,
            emailVerified: true,
          }
        : null,
    )

    const result = await service.login({
      email: 'friend@example.com',
      password: 'Friend@123456',
      captchaId: 'cap-1',
      captchaCode: 'a7k9',
    })

    expect(captcha.validateAndConsume).toHaveBeenCalledWith('login', 'cap-1', 'a7k9')
    expect(jwt.sign).toHaveBeenCalledWith({ sub: 'user-1', email: 'friend@example.com', role: UserRole.MEMBER })
    expect(result.accessToken).toBe('jwt-token')
    expect(result.user.email).toBe('friend@example.com')
    expect(result.user).not.toHaveProperty('password')
  })
})

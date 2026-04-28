import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

function mustEnv(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing env ${name}`)
  return v
}

async function main() {
  const emailOrUsername = mustEnv('RESET_LOGIN')
  const newPassword = mustEnv('RESET_PASSWORD')

  const prisma = new PrismaClient()
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: emailOrUsername },
          { email: { equals: emailOrUsername, mode: 'insensitive' } },
          { username: emailOrUsername },
          { username: { equals: emailOrUsername, mode: 'insensitive' } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    })
    if (!user) throw new Error(`User not found for login: ${emailOrUsername}`)

    const hash = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({ where: { id: user.id }, data: { password: hash } })

    // eslint-disable-next-line no-console
    console.log('[reset-user-password] ok', { userId: user.id, email: user.email, username: user.username })
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[reset-user-password] failed', e)
  process.exit(1)
})


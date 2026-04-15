import { UserRole } from '@prisma/client'

/** JWT validate 载荷（与 JwtStrategy.validate 返回一致） */
export type SessionUser = {
  id: string
  email: string
  username: string
  role: UserRole
  avatar: string | null
  teamId: string | null
}

import { SetMetadata } from '@nestjs/common'
import { UserRole } from '@prisma/client'

export const ROLES_KEY = 'roles'

/** 标记路由所需角色权限 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles)

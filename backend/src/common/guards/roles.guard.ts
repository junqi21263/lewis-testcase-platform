import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { UserRole } from '@prisma/client'
import { ROLES_KEY } from '../decorators/roles.decorator'

/** 角色权限守卫 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!requiredRoles || requiredRoles.length === 0) return true

    const { user } = context.switchToHttp().getRequest()
    if (!user) throw new ForbiddenException('权限不足')

    // 角色层级：SUPER_ADMIN > ADMIN > MEMBER > VIEWER
    const roleHierarchy: Record<UserRole, number> = {
      SUPER_ADMIN: 4,
      ADMIN: 3,
      MEMBER: 2,
      VIEWER: 1,
    }
    const userLevel = roleHierarchy[user.role as UserRole] ?? 0
    const requiredLevel = Math.min(...requiredRoles.map((r) => roleHierarchy[r] ?? 0))

    if (userLevel < requiredLevel) {
      throw new ForbiddenException('权限不足，无法执行此操作')
    }
    return true
  }
}

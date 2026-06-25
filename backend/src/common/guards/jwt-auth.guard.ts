import { Injectable, ExecutionContext, Optional, UnauthorizedException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Reflector } from '@nestjs/core'
import { isObservable, lastValueFrom } from 'rxjs'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { JwtDenylistService } from '@/modules/auth/jwt-denylist.service'

/** JWT 鉴权守卫，标记 @Public() 的路由跳过鉴权 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    @Optional() private readonly jwtDenylist?: JwtDenylistService,
  ) {
    super()
  }

  async canActivate(context: ExecutionContext) {
    // 检查是否标记为公开路由
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const result = super.canActivate(context)
    const allowed = isObservable(result) ? await lastValueFrom(result) : await Promise.resolve(result)
    if (!allowed) return false
    const req = context.switchToHttp().getRequest<{ headers?: { authorization?: string } }>()
    const authorization = req.headers?.authorization ?? ''
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    await this.jwtDenylist?.assertNotRevoked(token)
    return allowed
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw new UnauthorizedException('未授权，请先登录')
    }
    return user
  }
}

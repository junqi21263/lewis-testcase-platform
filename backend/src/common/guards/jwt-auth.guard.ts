import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Reflector } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

/** JWT 鉴权守卫，标记 @Public() 的路由跳过鉴权 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    // 检查是否标记为公开路由
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    return super.canActivate(context)
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw new UnauthorizedException('未授权，请先登录')
    }
    return user
  }
}

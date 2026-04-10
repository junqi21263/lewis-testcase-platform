import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler'

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  canActivate(context: ExecutionContext): Promise<boolean> {
    return super.canActivate(context)
  }
}
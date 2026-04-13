import { Injectable, ExecutionContext } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  canActivate(context: ExecutionContext): Promise<boolean> {
    return super.canActivate(context)
  }
}
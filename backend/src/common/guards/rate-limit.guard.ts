import { Injectable, ExecutionContext } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ method?: string }>()
    if (req.method === 'OPTIONS') return true
    return super.shouldSkip(context)
  }
}
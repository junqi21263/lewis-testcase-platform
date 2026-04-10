import { createParamDecorator, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common'

export interface MethodOptions {
  allowedMethods: string[]
  message?: string
}

export const Method = createParamDecorator(
  (options: MethodOptions, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest()
    const method = request.method
    
    if (!options.allowedMethods.includes(method)) {
      throw new HttpException(
        options.message || `Method ${method} not allowed for this endpoint`,
        HttpStatus.METHOD_NOT_ALLOWED
      )
    }
    
    return method
  }
)
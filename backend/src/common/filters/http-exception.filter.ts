import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Request, Response } from 'express'

const DEFAULT_ERROR_MESSAGES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: '请求参数错误',
  [HttpStatus.UNAUTHORIZED]: '未授权访问',
  [HttpStatus.FORBIDDEN]: '权限不足',
  [HttpStatus.NOT_FOUND]: '请求资源不存在',
  [HttpStatus.CONFLICT]: '资源冲突',
  [HttpStatus.UNPROCESSABLE_ENTITY]: '请求数据校验失败',
  [HttpStatus.TOO_MANY_REQUESTS]: '请求过于频繁，请稍后重试',
  [HttpStatus.INTERNAL_SERVER_ERROR]: '服务器内部错误',
  [HttpStatus.SERVICE_UNAVAILABLE]: '服务暂时不可用',
}

function resolveErrorMessage(status: number, message: string | string[] | undefined) {
  if (Array.isArray(message)) return message[0] || DEFAULT_ERROR_MESSAGES[status] || '请求失败'
  if (typeof message === 'string' && message.trim()) return message
  return DEFAULT_ERROR_MESSAGES[status] || '请求失败'
}

/** 全局 HTTP 异常过滤器，统一格式化错误响应 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()
    const status = exception.getStatus()

    const exceptionResponse = exception.getResponse()
    let message: string | string[]

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse
    } else if (typeof exceptionResponse === 'object') {
      message = (exceptionResponse as any).message || exception.message
    } else {
      message = exception.message
    }

    // 记录 4xx 以上的错误日志
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${status}: ${JSON.stringify(message)}`,
        exception.stack,
      )
    }

    response.status(status).json({
      code: status,
      message: resolveErrorMessage(status, message),
      data: null,
      timestamp: new Date().toISOString(),
      path: request.url,
    })
  }
}

/** 全局未捕获异常过滤器 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const status = HttpStatus.INTERNAL_SERVER_ERROR
    const message = exception instanceof Error ? exception.message : '服务器内部错误'

    this.logger.error(
      `${request.method} ${request.url} - Unhandled Exception`,
      exception instanceof Error ? exception.stack : String(exception),
    )

    response.status(status).json({
      code: status,
      message: message || DEFAULT_ERROR_MESSAGES[status] || '请求失败',
      data: null,
      timestamp: new Date().toISOString(),
      path: request.url,
    })
  }
}

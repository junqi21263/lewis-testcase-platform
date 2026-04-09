import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Request, Response } from 'express'

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
      message: Array.isArray(message) ? message[0] : message,
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
      message,
      data: null,
      timestamp: new Date().toISOString(),
      path: request.url,
    })
  }
}

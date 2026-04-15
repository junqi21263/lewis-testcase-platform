import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
  timestamp: string
}

type ExplicitResponsePayload<T> = {
  message?: string
  data?: T
}

function getSuccessMessage(method: string, path: string): string {
  const normalizedPath = path.toLowerCase()
  switch (method.toUpperCase()) {
    case 'GET':
      return '查询成功'
    case 'POST':
      if (normalizedPath.includes('/auth/login')) return '登录成功'
      if (normalizedPath.includes('/auth/register/send-code')) return '验证码已发送'
      if (normalizedPath.includes('/auth/register/confirm')) return '注册成功'
      if (normalizedPath.includes('/auth/register/resend-code')) return '验证码已重新发送'
      if (normalizedPath.includes('/auth/logout')) return '退出成功'
      if (normalizedPath.includes('/auth/forgot-password')) {
        return '若该邮箱已注册，您将收到验证码邮件（开发环境可查看服务端日志）'
      }
      if (normalizedPath.includes('/auth/reset-password')) return '密码重置成功'
      return '创建成功'
    case 'PUT':
    case 'PATCH':
      return '更新成功'
    case 'DELETE':
      return '删除成功'
    default:
      return '操作成功'
  }
}

/** 全局响应拦截器：统一包装成功响应格式 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>()
    const response = context.switchToHttp().getResponse<Response>()
    return next.handle().pipe(
      map((rawData) => {
        /** @Res() 已直接写出流/文件时跳过统一包装，避免二次写入 */
        if (response.headersSent || response.writableEnded) {
          return rawData as ApiResponse<T>
        }

        let message = getSuccessMessage(request.method, request.url)
        let data = rawData ?? null

        if (rawData && typeof rawData === 'object') {
          const explicitPayload = rawData as ExplicitResponsePayload<T>
          if (typeof explicitPayload.message === 'string' && explicitPayload.message.trim()) {
            message = explicitPayload.message
            data = ('data' in explicitPayload ? explicitPayload.data : null) as T
          }
        }

        return {
          code: 0,
          message,
          data: data as T,
          timestamp: new Date().toISOString(),
        }
      }),
    )
  }
}

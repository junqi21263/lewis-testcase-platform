import { Injectable, NestMiddleware } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'

@Injectable()
export class MethodValidationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const sensitivePaths = ['/auth/login', '/auth/register']
    const currentPath = req.path
    const method = req.method
    
    // 检查是否是敏感路径
    const isSensitivePath = sensitivePaths.some(path => currentPath.includes(path))

    // 仅拦截 GET/HEAD（防枚举）；POST 与 CORS 预检 OPTIONS 等均放行
    if (isSensitivePath && (method === 'GET' || method === 'HEAD')) {
      return res.status(405).json({
        code: 405,
        message: 'Method Not Allowed',
        data: null,
        timestamp: new Date().toISOString(),
        path: currentPath
      })
    }
    
    next()
  }
}
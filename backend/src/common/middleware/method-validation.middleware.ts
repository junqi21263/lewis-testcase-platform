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
    
    if (isSensitivePath && method !== 'POST' && method !== 'OPTIONS') {
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
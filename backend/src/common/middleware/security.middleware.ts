import { Injectable, NestMiddleware, Request, Response, NextFunction } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  constructor(private configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // 设置安全头
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('X-XSS-Protection', '1; mode=block')
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'")
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

    // 防止点击劫持
    res.setHeader('X-Frame-Options', 'DENY')

    // 防止 MIME 类型嗅探
    res.setHeader('X-Content-Type-Options', 'nosniff')

    // 防止 XSS 攻击
    res.setHeader('X-XSS-Protection', '1; mode=block')

    // 强制 HTTPS（在生产环境中）
    if (this.configService.get('NODE_ENV') === 'production') {
      if (req.secure) {
        next()
      } else {
        res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)
      }
    } else {
      next()
    }
  }
}
import { ConfigService } from '@nestjs/config'

/**
 * 读取环境变量：ConfigService 与 process.env 双通道。
 * 避免个别部署下 @nestjs/config 与运行时注入不一致导致误判「未配置」。
 */
export function envStr(config: ConfigService, key: string): string {
  const fromConfig = config.get<string | undefined>(key)
  if (fromConfig != null && String(fromConfig).trim() !== '') {
    return String(fromConfig).trim()
  }
  const raw = process.env[key]
  if (raw != null && String(raw).trim() !== '') {
    return String(raw).trim()
  }
  return ''
}

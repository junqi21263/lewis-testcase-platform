import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import { createWriteStream } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { v4 as uuid } from 'uuid'
import COS from 'cos-nodejs-sdk-v5'

/** 数据库 path 字段约定：`cos://{region}/{bucket}/{objectKey}` */
const COS_URI_RE = /^cos:\/\/([^/]+)\/([^/]+)\/(.+)$/

/**
 * 去掉 object key 中误写入的「空格 + # + 注释 + /」段（常见于 .env 里 COS_PREFIX=xxx # 中文说明 被拼进 key）。
 * 例：`ai-uploads/ # 上传文件的前缀目录，方便管理/uuid.png` → `ai-uploads/uuid.png`
 */
export function sanitizeCosObjectKey(key: string): string {
  let k = (key || '').trim().replace(/\\/g, '/')
  let prev = ''
  while (prev !== k) {
    prev = k
    k = k.replace(/\s+#.*?\//g, '/')
  }
  return k.replace(/\/{2,}/g, '/').replace(/^\//, '')
}

/** 读取 COS_*：去 BOM、行内 `#` 注释、首尾引号（常见于 .env / docker --env-file） */
export function sanitizeCosEnvValue(raw: string | undefined | null): string {
  let s = (raw ?? '').trim().replace(/^\uFEFF/, '')
  const cut = s.search(/\s+#/)
  if (cut >= 0) s = s.slice(0, cut).trim()
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim()
  }
  return s.replace(/\r$/, '')
}

/** 将 COS SDK 错误转为可操作的客户端提示（密钥/桶/地域/行内注释等） */
export function formatCosClientError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).trim()
  if (!msg) return 'COS 操作失败'
  if (/signature.*invalid|invalid.*signature/i.test(msg)) {
    return (
      'COS 签名无效：请核对 VPS 上 COS_SECRET_ID、COS_SECRET_KEY 是否与腾讯云控制台一致；' +
      'COS_BUCKET 须为「桶名-APPID」；COS_REGION 与桶地域一致（如 ap-guangzhou）；' +
      '.env 中勿在同一行值后写 # 注释。' +
      `（${msg}）`
    )
  }
  if (/accessdenied|access denied|403/i.test(msg)) {
    return `COS 权限不足：子账号需具备目标桶 PutObject 权限。（${msg}）`
  }
  if (/nosuchbucket|bucket.*not.*found/i.test(msg)) {
    return `COS 桶不存在或名称错误：请检查 COS_BUCKET 是否含 APPID 后缀。（${msg}）`
  }
  return msg
}

export function sanitizeCosPrefixFromEnv(raw: string | undefined | null): string {
  const s0 = (raw ?? '').trim()
  const cut = s0.search(/\s+#/)
  const s = cut >= 0 ? s0.slice(0, cut).trim() : s0
  return sanitizeCosObjectKey(s.endsWith('/') || !s ? s : `${s}/`)
}

@Injectable()
export class CosStorageService implements OnModuleInit {
  private readonly logger = new Logger(CosStorageService.name)
  private readonly cos: COS | null
  private lastProbe: { ok: boolean; error?: string; at: string } | null = null

  constructor(private readonly config: ConfigService) {
    const sid = sanitizeCosEnvValue(config.get<string>('COS_SECRET_ID'))
    const sk = sanitizeCosEnvValue(config.get<string>('COS_SECRET_KEY'))
    const token = sanitizeCosEnvValue(config.get<string>('COS_SECURITY_TOKEN'))
    if (sid && sk) {
      this.cos = new COS({
        SecretId: sid,
        SecretKey: sk,
        ...(token ? { SecurityToken: token } : {}),
      })
    } else {
      this.cos = null
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        'COS 未配置完整；上传可设 FILE_UPLOAD_STORAGE=local 使用本地 uploads 卷，或补齐 COS_SECRET_* / COS_BUCKET / COS_REGION',
      )
      return
    }
    const probe = await this.probePutAccess()
    this.lastProbe = { ok: probe.ok, error: probe.error, at: new Date().toISOString() }
    if (probe.ok) {
      this.logger.log(
        `COS 探针成功 bucket=${probe.bucket} region=${probe.region} secretIdSuffix=${probe.secretIdSuffix}`,
      )
    } else {
      this.logger.error(
        `COS 探针失败 bucket=${probe.bucket} region=${probe.region} secretIdSuffix=${probe.secretIdSuffix}: ${probe.error}`,
      )
    }
  }

  getLastProbe(): { ok: boolean; error?: string; at: string } | null {
    return this.lastProbe
  }

  /** SecretId/SecretKey/Bucket/Region 齐全时可读写 COS */
  isConfigured(): boolean {
    return !!(
      this.cos &&
      sanitizeCosEnvValue(this.config.get<string>('COS_BUCKET')) &&
      sanitizeCosEnvValue(this.config.get<string>('COS_REGION'))
    )
  }

  getPublicConfigSummary(): {
    configured: boolean
    bucket: string
    region: string
    prefix: string
    secretIdSuffix: string
  } {
    const sid = sanitizeCosEnvValue(this.config.get<string>('COS_SECRET_ID'))
    return {
      configured: this.isConfigured(),
      bucket: sanitizeCosEnvValue(this.config.get<string>('COS_BUCKET')),
      region: sanitizeCosEnvValue(this.config.get<string>('COS_REGION')),
      prefix: this.normalizePrefix(this.config.get<string>('COS_PREFIX')),
      secretIdSuffix: sid.length >= 4 ? sid.slice(-4) : sid ? '***' : '',
    }
  }

  /** 写入 1 字节探针对象后删除，用于启动与 /health/cos */
  async probePutAccess(): Promise<{
    ok: boolean
    error?: string
    bucket: string
    region: string
    secretIdSuffix: string
  }> {
    const summary = this.getPublicConfigSummary()
    if (!this.cos || !summary.configured) {
      return { ok: false, error: 'COS 未配置完整', ...summary }
    }
    const region = summary.region
    const bucket = summary.bucket
    const key = `${summary.prefix}_health_probe_${uuid()}.txt`
    try {
      await new Promise<void>((resolve, reject) => {
        this.cos!.putObject(
          { Bucket: bucket, Region: region, Key: key, Body: Buffer.from('1'), ContentLength: 1 },
          (err) => (err ? reject(err) : resolve()),
        )
      })
      await new Promise<void>((resolve, reject) => {
        this.cos!.deleteObject({ Bucket: bucket, Region: region, Key: key }, (err) =>
          err ? reject(err) : resolve(),
        )
      })
      return { ok: true, bucket, region, secretIdSuffix: summary.secretIdSuffix }
    } catch (e) {
      return {
        ok: false,
        error: formatCosClientError(e),
        bucket,
        region,
        secretIdSuffix: summary.secretIdSuffix,
      }
    }
  }

  static isCosUri(storedPath: string | null | undefined): boolean {
    return !!(storedPath && storedPath.trim().startsWith('cos://'))
  }

  /**
   * 规范化 DB 中的 cos://（清洗 object key 内误拼的「 #…/」注释段；兼容 BOM/首尾空白）。
   * 新上传应保证 COS_PREFIX 单独成行写注释，勿写在同一行值后。
   */
  static normalizeCosStoredPath(storedPath: string | null | undefined): string {
    const raw = (storedPath ?? '').trim().replace(/^\uFEFF/, '')
    if (!raw.startsWith('cos://')) return raw
    const m = raw.match(COS_URI_RE)
    if (!m) return raw
    const key = sanitizeCosObjectKey(m[3])
    const region = m[1].replace(/\s+#.*$/, '').replace(/\s+/g, '').trim()
    const bucket = m[2].replace(/\s+#.*$/, '').replace(/\s+/g, '').trim()
    if (!region || !bucket || !key) return raw
    return `cos://${region}/${bucket}/${key}`
  }

  /**
   * 防御性清洗：去掉形如 `value # comment` 的行内注释，避免被当成真实配置值。
   */
  /**
   * 仅允许用于 region/bucket 这类 token 场景，额外移除空白。
   */
  private normalizeToken(value: string | null | undefined): string {
    return sanitizeCosEnvValue(value).replace(/\s+/g, '')
  }

  /**
   * 兼容历史脏数据：
   * 1) 去掉 object key 中注释段：`/ # xxx/`
   * 2) 归一化分隔符，避免重复 `/`
   */
  private normalizeObjectKey(value: string): string {
    return sanitizeCosObjectKey(value)
  }

  private normalizePrefix(value: string | null | undefined): string {
    return sanitizeCosPrefixFromEnv(value)
  }

  parseUri(storedPath: string): { region: string; bucket: string; key: string } | null {
    const normalized = CosStorageService.normalizeCosStoredPath(storedPath)
    const m = normalized.match(COS_URI_RE)
    if (!m) return null
    const region = this.normalizeToken(m[1])
    const bucket = this.normalizeToken(m[2])
    const key = this.normalizeObjectKey(m[3])
    if (!region || !bucket || !key) return null
    return { region, bucket, key }
  }

  buildUri(region: string, bucket: string, key: string): string {
    const safeRegion = this.normalizeToken(region)
    const safeBucket = this.normalizeToken(bucket)
    const safeKey = this.normalizeObjectKey(key)
    return `cos://${safeRegion}/${safeBucket}/${safeKey}`
  }

  /** 解析前临时文件目录（默认 os.tmpdir()，Linux 多为 /tmp）；可设 COS_PARSE_TEMP_DIR */
  private parseTempDir(): string {
    const d = this.config.get<string>('COS_PARSE_TEMP_DIR')?.trim()
    if (d) {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
      return d
    }
    return os.tmpdir()
  }

  /** 内存直传 COS（不落本地 uploads） */
  async uploadBuffer(buffer: Buffer, originalName: string): Promise<string> {
    if (!this.cos || !this.isConfigured()) {
      throw new Error('COS 未配置完整')
    }
    const region = this.normalizeToken(this.config.get<string>('COS_REGION'))
    const bucket = this.normalizeToken(this.config.get<string>('COS_BUCKET'))
    if (!region || !bucket) throw new Error('COS_REGION/COS_BUCKET 配置无效')
    const prefix = this.normalizePrefix(this.config.get<string>('COS_PREFIX'))
    const ext = path.extname(originalName) || ''
    const key = `${prefix}${uuid()}${ext}`

    await new Promise<void>((resolve, reject) => {
      this.cos!.putObject(
        {
          Bucket: bucket,
          Region: region,
          Key: key,
          Body: buffer,
          ContentLength: buffer.length,
        },
        (err) => (err ? reject(err) : resolve()),
      )
    })

    return this.buildUri(region, bucket, key)
  }

  /**
   * 将 Multer 落盘文件上传至 COS，返回写入 DB 的 URI；失败时抛错由调用方决定是否保留本地。
   */
  async uploadLocalFile(localPath: string, originalName: string): Promise<string> {
    if (!this.cos || !this.isConfigured()) {
      throw new Error('COS 未配置完整')
    }
    const region = this.normalizeToken(this.config.get<string>('COS_REGION'))
    const bucket = this.normalizeToken(this.config.get<string>('COS_BUCKET'))
    if (!region || !bucket) throw new Error('COS_REGION/COS_BUCKET 配置无效')
    const prefix = this.normalizePrefix(this.config.get<string>('COS_PREFIX'))
    const ext = path.extname(originalName) || ''
    const key = `${prefix}${uuid()}${ext}`

    await new Promise<void>((resolve, reject) => {
      this.cos!.putObject(
        {
          Bucket: bucket,
          Region: region,
          Key: key,
          Body: fs.createReadStream(localPath),
        },
        (err) => (err ? reject(err) : resolve()),
      )
    })

    return this.buildUri(region, bucket, key)
  }

  /**
   * 生成带签名的 HTTPS GET 链接（供腾讯云 OCR ImageUrl 等外网拉取；默认 2 小时有效）。
   */
  async getSignedGetObjectUrl(storedPath: string, expiresSec = 7200): Promise<string> {
    if (!this.cos) throw new Error('COS 未配置')
    const parsed = this.parseUri(storedPath)
    if (!parsed) throw new Error('无效的 COS 路径')
    const exp =
      Number.isFinite(expiresSec) && expiresSec >= 60 && expiresSec <= 86400 ? Math.floor(expiresSec) : 7200
    return new Promise<string>((resolve, reject) => {
      this.cos!.getObjectUrl(
        {
          Bucket: parsed.bucket,
          Region: parsed.region,
          Key: parsed.key,
          Sign: true,
          Method: 'GET',
          Expires: exp,
        },
        (err, data) => {
          if (err) reject(err)
          else if (data?.Url) resolve(data.Url)
          else reject(new Error('COS getObjectUrl 未返回 Url'))
        },
      )
    })
  }

  async deleteObject(storedPath: string): Promise<void> {
    if (!this.cos) return
    const parsed = this.parseUri(storedPath)
    if (!parsed) return
    await new Promise<void>((resolve, reject) => {
      this.cos!.deleteObject(
        {
          Bucket: parsed.bucket,
          Region: parsed.region,
          Key: parsed.key,
        },
        (err) => (err ? reject(err) : resolve()),
      )
    })
  }

  /** 流式下载到临时文件（默认在系统临时目录 / COS_PARSE_TEMP_DIR），调用方须在使用后删除 */
  async downloadToTempFile(storedPath: string): Promise<string> {
    if (!this.cos) throw new Error('COS 未配置')
    const parsed = this.parseUri(storedPath)
    if (!parsed) throw new Error('无效的 COS 路径')
    const ext = path.extname(parsed.key) || '.bin'
    const tmp = path.join(this.parseTempDir(), `cos-dl-${uuid()}${ext}`)
    const ws = createWriteStream(tmp)
    const timeoutRaw = parseInt(this.config.get<string>('COS_DOWNLOAD_TIMEOUT_MS') || '120000', 10)
    const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw >= 10_000 ? timeoutRaw : 120_000

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const done = (err?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (err) reject(err)
        else resolve()
      }
      const timer = setTimeout(() => {
        try {
          ws.destroy(new Error(`COS 下载超时（>${timeoutMs}ms）`))
        } catch {
          /* ignore */
        }
        done(new Error(`COS 下载超时（>${timeoutMs}ms）`))
      }, timeoutMs)
      ws.once('error', (e) => done(e instanceof Error ? e : new Error(String(e))))
      ws.once('finish', () => done())
      this.cos!.getObject(
        {
          Bucket: parsed.bucket,
          Region: parsed.region,
          Key: parsed.key,
          Output: ws,
        },
        (err) => {
          if (err) done(err instanceof Error ? err : new Error(String(err)))
        },
      )
    })

    return tmp
  }
}

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import { createWriteStream } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { v4 as uuid } from 'uuid'
import COS from 'cos-nodejs-sdk-v5'

/** 数据库 path 字段约定：`cos://{region}/{bucket}/{objectKey}` */
const COS_URI_RE = /^cos:\/\/([^/]+)\/([^/]+)\/(.+)$/

@Injectable()
export class CosStorageService {
  private readonly logger = new Logger(CosStorageService.name)
  private readonly cos: COS | null

  constructor(private readonly config: ConfigService) {
    const sid = config.get<string>('COS_SECRET_ID')?.trim()
    const sk = config.get<string>('COS_SECRET_KEY')?.trim()
    if (sid && sk) {
      this.cos = new COS({ SecretId: sid, SecretKey: sk })
    } else {
      this.cos = null
    }
  }

  /** SecretId/SecretKey/Bucket/Region 齐全时可读写 COS */
  isConfigured(): boolean {
    return !!(
      this.cos &&
      this.config.get<string>('COS_BUCKET')?.trim() &&
      this.config.get<string>('COS_REGION')?.trim()
    )
  }

  static isCosUri(storedPath: string | null | undefined): boolean {
    return !!storedPath?.startsWith('cos://')
  }

  parseUri(storedPath: string): { region: string; bucket: string; key: string } | null {
    const m = storedPath.match(COS_URI_RE)
    if (!m) return null
    return { region: m[1], bucket: m[2], key: m[3] }
  }

  buildUri(region: string, bucket: string, key: string): string {
    return `cos://${region}/${bucket}/${key}`
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
    const region = this.config.get<string>('COS_REGION')!.trim()
    const bucket = this.config.get<string>('COS_BUCKET')!.trim()
    let prefix = (this.config.get<string>('COS_PREFIX') ?? '').trim()
    if (prefix && !prefix.endsWith('/')) prefix += '/'
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
    const region = this.config.get<string>('COS_REGION')!.trim()
    const bucket = this.config.get<string>('COS_BUCKET')!.trim()
    let prefix = (this.config.get<string>('COS_PREFIX') ?? '').trim()
    if (prefix && !prefix.endsWith('/')) prefix += '/'
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

    await new Promise<void>((resolve, reject) => {
      ws.once('error', reject)
      ws.once('finish', resolve)
      this.cos!.getObject(
        {
          Bucket: parsed.bucket,
          Region: parsed.region,
          Key: parsed.key,
          Output: ws,
        },
        (err) => {
          if (err) reject(err)
        },
      )
    })

    return tmp
  }
}

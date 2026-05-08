import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import { createWriteStream } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { pipeline } from 'stream/promises'
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

  /** 下载到临时文件，调用方须在使用后删除 */
  async downloadToTempFile(storedPath: string): Promise<string> {
    if (!this.cos) throw new Error('COS 未配置')
    const parsed = this.parseUri(storedPath)
    if (!parsed) throw new Error('无效的 COS 路径')
    const ext = path.extname(parsed.key) || '.bin'
    const tmp = path.join(os.tmpdir(), `cos-dl-${uuid()}${ext}`)

    await new Promise<void>((resolve, reject) => {
      this.cos!.getObject(
        {
          Bucket: parsed.bucket,
          Region: parsed.region,
          Key: parsed.key,
        },
        async (err, data) => {
          if (err) return reject(err)
          const body = data?.Body
          try {
            if (Buffer.isBuffer(body)) {
              fs.writeFileSync(tmp, body)
            } else if (body && typeof (body as NodeJS.ReadableStream).pipe === 'function') {
              await pipeline(body as NodeJS.ReadableStream, createWriteStream(tmp))
            } else {
              throw new Error('COS 返回体无法解析')
            }
            resolve()
          } catch (e) {
            reject(e)
          }
        },
      )
    })

    return tmp
  }
}

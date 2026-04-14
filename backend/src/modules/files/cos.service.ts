import { Injectable, Logger } from '@nestjs/common'
import COS from 'cos-nodejs-sdk-v5'
import * as path from 'path'

function envStr(name: string, defaultValue = ''): string {
  const v = process.env[name]
  return (v == null ? defaultValue : String(v)).trim()
}

function envBool(name: string, defaultValue = false): boolean {
  const v = envStr(name, '')
  if (!v) return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
}

@Injectable()
export class CosService {
  private readonly logger = new Logger(CosService.name)
  private readonly enabled: boolean
  private readonly bucket: string
  private readonly region: string
  private readonly prefix: string
  private readonly cos?: COS

  constructor() {
    this.enabled = envStr('FILE_STORAGE', 'local').toLowerCase() === 'cos'
    this.bucket = envStr('COS_BUCKET')
    this.region = envStr('COS_REGION')
    this.prefix = envStr('COS_PREFIX', 'uploads').replace(/^\/+|\/+$/g, '')

    if (!this.enabled) return

    const secretId = envStr('COS_SECRET_ID')
    const secretKey = envStr('COS_SECRET_KEY')
    if (!secretId || !secretKey || !this.bucket || !this.region) {
      this.logger.warn('COS 未启用：缺少 COS_SECRET_ID/COS_SECRET_KEY/COS_BUCKET/COS_REGION')
      this.enabled = false
      return
    }

    this.cos = new COS({ SecretId: secretId, SecretKey: secretKey })
  }

  isEnabled() {
    return this.enabled
  }

  buildObjectKey(fileId: string, originalName: string) {
    const ext = path.extname(originalName || '').slice(0, 16)
    const safeExt = ext && ext.startsWith('.') ? ext : ''
    const date = new Date()
    const y = String(date.getUTCFullYear())
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    const prefix = this.prefix ? `${this.prefix}/` : ''
    return `${prefix}${y}/${m}/${d}/${fileId}${safeExt}`
  }

  /**
   * 分片临时对象 key（必须稳定，不依赖日期/时间，避免上传跨日导致 merge 找不到）
   * chunks/{fileId}/{chunkIndex}.part
   */
  buildChunkKey(fileId: string, chunkIndex: number) {
    const prefix = this.prefix ? `${this.prefix}/` : ''
    return `${prefix}chunks/${fileId}/${chunkIndex}.part`
  }

  buildChunkPrefix(fileId: string) {
    const prefix = this.prefix ? `${this.prefix}/` : ''
    return `${prefix}chunks/${fileId}/`
  }

  async uploadLocalFile(localPath: string, key: string) {
    if (!this.enabled || !this.cos) throw new Error('COS not enabled')
    await new Promise<void>((resolve, reject) => {
      this.cos!.uploadFile(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
          FilePath: localPath,
          SliceSize: 5 * 1024 * 1024,
        } as any,
        (err) => {
          if (err) reject(err)
          else resolve()
        },
      )
    })
    return { bucket: this.bucket, region: this.region, key }
  }

  async uploadLocalChunk(localPath: string, key: string) {
    // chunk 也是普通对象上传
    return this.uploadLocalFile(localPath, key)
  }

  async getObjectStream(key: string): Promise<NodeJS.ReadableStream> {
    if (!this.enabled || !this.cos) throw new Error('COS not enabled')
    const res = await new Promise<any>((resolve, reject) => {
      this.cos!.getObject(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
        },
        (err, data) => {
          if (err) reject(err)
          else resolve(data)
        },
      )
    })
    if (!res?.Body) throw new Error('COS getObject missing body')
    return res.Body as NodeJS.ReadableStream
  }

  async deletePrefix(prefix: string) {
    if (!this.enabled || !this.cos) return
    const cleanPrefix = prefix.replace(/^\/+/, '')
    const listed = await new Promise<any>((resolve, reject) => {
      this.cos!.getBucket(
        {
          Bucket: this.bucket,
          Region: this.region,
          Prefix: cleanPrefix,
          MaxKeys: 1000,
        },
        (err, data) => {
          if (err) reject(err)
          else resolve(data)
        },
      )
    })
    const contents: Array<{ Key: string }> = listed?.Contents || []
    if (!contents.length) return
    await new Promise<void>((resolve, reject) => {
      this.cos!.deleteMultipleObject(
        {
          Bucket: this.bucket,
          Region: this.region,
          Objects: contents.map((c) => ({ Key: c.Key })),
          Quiet: true,
        },
        (err) => {
          if (err) reject(err)
          else resolve()
        },
      )
    })
  }

  getSignedUrl(key: string, expiresSeconds = 3600) {
    if (!this.enabled || !this.cos) throw new Error('COS not enabled')
    return this.cos.getObjectUrl({
      Bucket: this.bucket,
      Region: this.region,
      Key: key,
      Sign: true,
      Expires: expiresSeconds,
    })
  }

  async deleteObject(key: string) {
    if (!this.enabled || !this.cos) return
    await new Promise<void>((resolve, reject) => {
      this.cos!.deleteObject(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
        },
        (err) => {
          if (err) reject(err)
          else resolve()
        },
      )
    })
  }
}


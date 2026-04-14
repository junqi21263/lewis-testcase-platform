import { Injectable, Logger } from '@nestjs/common'
import COS from 'cos-nodejs-sdk-v5'
import * as path from 'path'
import { Readable } from 'stream'

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
   *
   * 注意：这里**不使用 COS_PREFIX**，否则滚动发布/多实例环境变量不一致时会出现
   * 同一 fileId 的分片写入到不同 prefix，导致 merge 只看到部分分片。
   * chunks/{fileId}/{chunkIndex}.part
   */
  buildChunkKey(fileId: string, chunkIndex: number) {
    return `chunks/${fileId}/${chunkIndex}.part`
  }

  buildChunkPrefix(fileId: string) {
    return `chunks/${fileId}/`
  }

  /** 兼容历史/错误配置：同时尝试带 prefix 与不带 prefix 的 chunk key */
  getChunkKeyVariants(fileId: string, chunkIndex: number) {
    const base = `chunks/${fileId}/${chunkIndex}.part`
    const prefixed = this.prefix ? `${this.prefix}/${base}` : null
    return prefixed ? [base, prefixed] : [base]
  }

  getChunkPrefixVariants(fileId: string) {
    const base = `chunks/${fileId}/`
    const prefixed = this.prefix ? `${this.prefix}/${base}` : null
    return prefixed ? [base, prefixed] : [base]
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
    const body = res?.Body
    if (body == null) throw new Error('COS getObject missing body')

    // SDK 的 Body 可能是 stream / Buffer / string / Uint8Array 等；统一转成可读流
    if (typeof (body as any)?.pipe === 'function') {
      return body as NodeJS.ReadableStream
    }
    if (Buffer.isBuffer(body) || typeof body === 'string') {
      return Readable.from([body])
    }
    if (body instanceof Uint8Array) {
      return Readable.from([body])
    }
    // 兜底：尝试包一层，避免 pipeline 把 iterable<number> 写成 number
    return Readable.from([body])
  }

  async getChunkStream(fileId: string, chunkIndex: number): Promise<{ stream: NodeJS.ReadableStream; key: string }> {
    const keys = this.getChunkKeyVariants(fileId, chunkIndex)
    let lastErr: unknown
    for (const key of keys) {
      try {
        const stream = await this.getObjectStream(key)
        return { stream, key }
      } catch (e) {
        lastErr = e
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
  }

  async listChunkKeys(fileId: string) {
    const prefixes = this.getChunkPrefixVariants(fileId)
    const all = new Set<string>()
    for (const p of prefixes) {
      const keys = await this.listKeys(p).catch(() => [])
      for (const k of keys) all.add(k)
    }
    return Array.from(all).sort()
  }

  async listKeys(prefix: string) {
    if (!this.enabled || !this.cos) throw new Error('COS not enabled')
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
    return contents.map((c) => c.Key)
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


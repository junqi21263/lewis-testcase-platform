import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import {
  buildJsonObjectResponseFormat,
  buildStrictCaseResponseFormat,
  isStructuredOutputUnsupportedError,
} from './testcase-output-schema.util'

@Injectable()
export class AiStructuredOutputService {
  private readonly logger = new Logger(AiStructuredOutputService.name)
  private readonly jsonSchemaUnsupportedModels = new Set<string>()
  private readonly jsonObjectUnsupportedModels = new Set<string>()

  constructor(private readonly config: ConfigService) {}

  structuredOutputFallbackNotice(): string {
    return '当前模型网关不支持 json_schema 严格结构化输出，已回退兼容模式，并继续执行本地 schema 校验与自动修复。'
  }

  jsonObjectFallbackNotice(): string {
    return '当前模型网关不支持 response_format json_object，已改用 Prompt JSON 约束与本地解析/修复兼容模式。'
  }

  private strictSchemaEnabled(): boolean {
    const raw = String(this.config.get<string>('AI_STRICT_SCHEMA_OUTPUT') ?? 'true').toLowerCase()
    return !['0', 'false', 'off', 'no'].includes(raw)
  }

  private structuredOutputCacheKey(payload: Record<string, unknown>): string {
    const model = typeof payload.model === 'string' && payload.model.trim() ? payload.model.trim() : 'unknown-model'
    return model
  }

  private joinFallbackNotices(values: Array<string | undefined>): string | undefined {
    const unique = [...new Set(values.filter((v): v is string => Boolean(v)))]
    return unique.length > 0 ? unique.join(' ') : undefined
  }

  async createJsonObjectCompatibleCompletion(
    client: OpenAI,
    payload: Record<string, unknown>,
    context: string,
  ): Promise<{ completion: any; fallbackNotice?: string }> {
    const cacheKey = this.structuredOutputCacheKey(payload)
    if (!this.jsonObjectUnsupportedModels.has(cacheKey)) {
      try {
        const completion = await client.chat.completions.create({
          ...payload,
          response_format: buildJsonObjectResponseFormat() as any,
        } as any)
        return { completion }
      } catch (err) {
        if (!isStructuredOutputUnsupportedError(err)) throw err
        this.jsonObjectUnsupportedModels.add(cacheKey)
        this.logger.warn(`${context} json_object 输出不可用，回退无 response_format: ${(err as Error).message}`)
      }
    }

    const completion = await client.chat.completions.create({
      ...payload,
    } as any)
    return {
      completion,
      fallbackNotice: this.jsonObjectFallbackNotice(),
    }
  }

  async createCaseCompletion(
    client: OpenAI,
    payload: Record<string, unknown>,
  ): Promise<{ completion: any; fallbackNotice?: string }> {
    const cacheKey = this.structuredOutputCacheKey(payload)
    const shouldTryStrictSchema = this.strictSchemaEnabled() && !this.jsonSchemaUnsupportedModels.has(cacheKey)
    let discoveredUnsupported = false

    if (shouldTryStrictSchema) {
      try {
        const completion = await client.chat.completions.create({
          ...payload,
          response_format: buildStrictCaseResponseFormat() as any,
        } as any)
        return { completion }
      } catch (err) {
        if (!isStructuredOutputUnsupportedError(err)) throw err
        this.jsonSchemaUnsupportedModels.add(cacheKey)
        discoveredUnsupported = true
        this.logger.warn(`严格 json_schema 输出不可用，回退 json_object: ${(err as Error).message}`)
      }
    }

    const { completion, fallbackNotice } = await this.createJsonObjectCompatibleCompletion(
      client,
      payload,
      '用例生成',
    )
    return {
      completion,
      fallbackNotice: this.joinFallbackNotices([
        discoveredUnsupported ? this.structuredOutputFallbackNotice() : undefined,
        fallbackNotice,
      ]),
    }
  }

  async createCaseStream(
    client: OpenAI,
    payload: Record<string, unknown>,
  ): Promise<{ stream: AsyncIterable<any>; fallbackNotice?: string }> {
    if (this.strictSchemaEnabled()) {
      try {
        const stream = await client.chat.completions.create({
          ...payload,
          stream: true,
          response_format: buildStrictCaseResponseFormat() as any,
        } as any)
        return { stream: stream as unknown as AsyncIterable<any> }
      } catch (err) {
        if (!isStructuredOutputUnsupportedError(err)) throw err
        this.logger.warn(`流式严格 json_schema 输出不可用，回退普通流式: ${(err as Error).message}`)
      }
    }

    try {
      const stream = await client.chat.completions.create({
        ...payload,
        stream: true,
        response_format: buildJsonObjectResponseFormat() as any,
      } as any)
      return {
        stream: stream as unknown as AsyncIterable<any>,
        fallbackNotice: this.structuredOutputFallbackNotice(),
      }
    } catch (err) {
      if (!isStructuredOutputUnsupportedError(err)) throw err
      this.logger.warn(`流式 json_object 输出不可用，回退无 response_format: ${(err as Error).message}`)
      const stream = await client.chat.completions.create({
        ...payload,
        stream: true,
      } as any)
      return {
        stream: stream as unknown as AsyncIterable<any>,
        fallbackNotice: this.structuredOutputFallbackNotice(),
      }
    }
  }
}

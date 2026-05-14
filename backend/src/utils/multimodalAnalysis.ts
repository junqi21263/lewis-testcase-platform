import { ConfigService } from '@nestjs/config'
import { Logger } from '@nestjs/common'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { CosStorageService } from '@/modules/files/cos-storage.service'

const logger = new Logger('HunyuanOpenAiMultimodal')

/** 混元 OpenAI 兼容接口（默认全路径，可用 HUNYUAN_OPENAI_BASE_URL 覆盖） */
export const HUNYUAN_OPENAI_CHAT_COMPLETIONS_URL_DEFAULT =
  'https://api.hunyuan.cloud.tencent.com/v1/chat/completions'

/**
 * 是否启用混元多模态（OpenAI 兼容通道）。
 * 兼容旧开关名：HUNYUAN_COS_MULTIMODAL_PARSE_ENABLED=1 仍视为开启多模态尝试（需同时配置 HUNYUAN_VISION_API_KEY）。
 */
export function isHunyuanMultimodalEnabled(config: ConfigService): boolean {
  const a = config.get<string>('HUNYUAN_MULTIMODAL_ENABLED')?.trim()
  if (a === '1' || a?.toLowerCase() === 'true') return true
  const b = config.get<string>('HUNYUAN_COS_MULTIMODAL_PARSE_ENABLED')?.trim()
  return b === '1' || b?.toLowerCase() === 'true'
}

/** @deprecated 请使用 isHunyuanMultimodalEnabled */
export function isHunyuanCosMultimodalParseEnabled(config: ConfigService): boolean {
  return isHunyuanMultimodalEnabled(config)
}

export function resolveHunyuanVisionApiKey(config: ConfigService): string | null {
  const k =
    config.get<string>('HUNYUAN_VISION_API_KEY')?.trim() ||
    config.get<string>('HUNYUAN_OPENAI_API_KEY')?.trim()
  return k || null
}

function guessMimeFromPath(localPath: string, fileKind: 'image' | 'pdf'): string {
  if (fileKind === 'pdf') return 'application/pdf'
  const ext = path.extname(localPath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'image/jpeg'
}

function normalizeOpenAiMessageContent(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    const parts = content as Array<{ type?: string; text?: string }>
    return parts
      .map((p) => (typeof p?.text === 'string' ? p.text : ''))
      .join('')
      .trim()
  }
  return ''
}

/**
 * 调用混元 OpenAI 兼容多模态接口（仅 axios）。
 * Content 使用标准数组：[{type:text},{type:image_url,image_url:{url:data:...}}]
 */
export async function runHunyuanOpenAiVisionChat(params: {
  config: ConfigService
  localPath: string
  fileKind: 'image' | 'pdf'
  prompt: string
}): Promise<{
  text: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}> {
  if (!isHunyuanMultimodalEnabled(params.config)) {
    throw new Error('混元多模态未启用（HUNYUAN_MULTIMODAL_ENABLED 或兼容 HUNYUAN_COS_MULTIMODAL_PARSE_ENABLED）')
  }
  const apiKey = resolveHunyuanVisionApiKey(params.config)
  if (!apiKey) {
    throw new Error('混元 OpenAI 多模态：缺少 HUNYUAN_VISION_API_KEY（sk- 开头 API Key）')
  }
  const lp = params.localPath?.trim()
  if (!lp || !fs.existsSync(lp)) {
    throw new Error(`混元多模态：本地文件不存在：${lp || '(empty)'}`)
  }

  const buf = fs.readFileSync(lp)
  const mime = guessMimeFromPath(lp, params.fileKind)
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`

  const url =
    params.config.get<string>('HUNYUAN_OPENAI_BASE_URL')?.trim() ||
    HUNYUAN_OPENAI_CHAT_COMPLETIONS_URL_DEFAULT
  const model =
    params.config.get<string>('HUNYUAN_MULTIMODAL_MODEL')?.trim() || 'hunyuan-vision'
  const temperature = parseFloat(params.config.get<string>('HUNYUAN_MULTIMODAL_TEMPERATURE') || '0.1')
  const timeoutMs = parseInt(params.config.get<string>('HUNYUAN_OPENAI_TIMEOUT_MS') || '180000', 10)
  const timeout = Number.isFinite(timeoutMs) && timeoutMs >= 10_000 ? timeoutMs : 180_000

  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: params.prompt },
          {
            type: 'image_url',
            image_url: { url: dataUrl },
          },
        ],
      },
    ],
    temperature: Number.isFinite(temperature) ? temperature : 0.1,
  }

  try {
    const { data, status } = await axios.post<Record<string, unknown>>(url, body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout,
      validateStatus: () => true,
    })

    if (status < 200 || status >= 300) {
      const errBody = typeof data === 'object' && data && 'error' in data ? (data as any).error : data
      throw new Error(`混元 API HTTP ${status}：${JSON.stringify(errBody).slice(0, 2000)}`)
    }

    const err = (data as any)?.error
    if (err?.message) {
      throw new Error(`混元 API：${String(err.message)}`)
    }

    const choices = (data as any)?.choices as unknown[] | undefined
    const choice0 = Array.isArray(choices) && choices.length > 0 ? (choices[0] as any) : null
    const content = choice0?.message?.content
    const text = normalizeOpenAiMessageContent(content)
    if (!text) {
      throw new Error('混元 API：choices[0].message.content 为空')
    }

    const usage = (data as any)?.usage
    return {
      text,
      promptTokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : undefined,
      completionTokens: typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : undefined,
      totalTokens: typeof usage?.total_tokens === 'number' ? usage.total_tokens : undefined,
    }
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const msg = e.response?.data ? JSON.stringify(e.response.data).slice(0, 2000) : e.message
      logger.warn(`混元 OpenAI 请求失败: ${msg}`)
    }
    throw e
  }
}

/**
 * 是否满足「混元 OpenAI 多模态直读」前提：开关、API Key、本地可读文件、体积上限。
 * cosStorage / storedPath 参数保留以兼容旧调用方与单测签名；OpenAI 通道不依赖 COS 外链。
 */
export function canTryHunyuanCosMultimodalParse(
  config: ConfigService,
  _cosStorage: CosStorageService,
  storedPath: string,
  fileKind: 'image' | 'pdf',
  fileBytes: number,
  localPath?: string,
): boolean {
  if (!isHunyuanMultimodalEnabled(config)) {
    logger.debug('Hunyuan OpenAI multimodal: disabled')
    return false
  }
  if (!resolveHunyuanVisionApiKey(config)) {
    logger.warn('Hunyuan OpenAI multimodal: missing HUNYUAN_VISION_API_KEY (or HUNYUAN_OPENAI_API_KEY fallback)')
    return false
  }
  const lp = localPath?.trim()
  if (!lp || !fs.existsSync(lp)) {
    logger.warn('Hunyuan OpenAI multimodal: localPath missing or file not found')
    return false
  }
  if (fileKind === 'pdf') {
    const maxMb = parseInt(config.get<string>('HUNYUAN_COS_MULTIMODAL_MAX_PDF_MB') || '40', 10)
    const mb = fileBytes / (1024 * 1024)
    if (Number.isFinite(maxMb) && maxMb > 0 && mb > maxMb) {
      logger.warn(`Hunyuan OpenAI multimodal: PDF ${mb.toFixed(1)}MB 超过上限 ${maxMb}MB，跳过`)
      return false
    }
  }
  if (fileKind === 'image') {
    const maxMb = parseInt(config.get<string>('HUNYUAN_COS_MULTIMODAL_MAX_IMAGE_MB') || '18', 10)
    const mb = fileBytes / (1024 * 1024)
    if (Number.isFinite(maxMb) && maxMb > 0 && mb > maxMb) {
      logger.warn(`Hunyuan OpenAI multimodal: 图片 ${mb.toFixed(1)}MB 超过上限 ${maxMb}MB，跳过`)
      return false
    }
  }
  return true
}

function buildStructuredRequirementPrompt(fileKind: 'image' | 'pdf'): string {
  const docLabel = fileKind === 'image' ? 'UI设计图' : 'PDF文档'
  return `你是资深产品需求分析师，请仔细分析这张${docLabel}，提取完整的结构化需求分析报告。

请严格按照以下格式输出，语言专业简洁，不要添加无关内容：

# 一、页面/文档功能概述
- 页面名称：
- 核心功能：
- 目标用户：
- 业务价值：

# 二、核心功能模块
| 模块名称 | 功能描述 | 优先级（高/中/低） |
|----------|----------|-------------------|
| 模块1    | ...      | 高                |

# 三、交互逻辑说明
- 按钮点击事件：
- 表单提交逻辑：
- 页面跳转规则：
- 状态变化逻辑：

# 四、UI元素与布局
- 主要组件：（列出所有按钮、输入框、列表、导航等组件）
- 布局结构：
- 视觉风格：

# 五、非功能需求
- 性能要求：
- 兼容性要求：
- 响应式要求：

# 六、接口需求
| 接口名称 | 请求方法 | 接口路径 | 功能说明 |
|----------|----------|----------|----------|
| 接口1    | POST     | /api/xxx | 功能说明 |

# 七、风险与建议
- 潜在风险：
- 优化建议：

请确保分析全面，覆盖所有可见的功能和交互细节。`
}

/**
 * 解析阶段：对本地图片/PDF 走混元多模态理解（Base64），返回结构化 Markdown 正文。
 */
export async function analyzeCosFileWithHunyuanMultimodal(params: {
  config: ConfigService
  localPath: string
  fileKind: 'image' | 'pdf'
}): Promise<string> {
  const prompt = buildStructuredRequirementPrompt(params.fileKind)
  const out = await runHunyuanOpenAiVisionChat({
    config: params.config,
    localPath: params.localPath,
    fileKind: params.fileKind,
    prompt,
  })
  return out.text
}

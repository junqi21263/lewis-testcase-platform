import { ConfigService } from '@nestjs/config'
import { Logger } from '@nestjs/common'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { CosStorageService } from '@/modules/files/cos-storage.service'
import { sanitizeErrorMessageForClient } from '@/utils/sanitizeErrorMessage'

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

/** 超过该体积的 PDF 禁止整本 data:application/pdf;base64 直传混元（易触发 image download failed） */
export function getHunyuanPdfWholeFileMaxBytes(config: ConfigService): number {
  const mb = parseFloat(config.get<string>('HUNYUAN_PDF_WHOLE_FILE_MAX_MB') || '1.5')
  if (!Number.isFinite(mb) || mb <= 0) return 1_572_864
  return Math.round(mb * 1024 * 1024)
}

export function isPdfTooLargeForHunyuanWholeFileBase64(
  config: ConfigService,
  fileBytes: number,
): boolean {
  return fileBytes > getHunyuanPdfWholeFileMaxBytes(config)
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

function buildHunyuanVisionRequestBody(params: {
  config: ConfigService
  prompt: string
  imageDataUrls: string[]
}) {
  const model =
    params.config.get<string>('HUNYUAN_MULTIMODAL_MODEL')?.trim() || 'hunyuan-vision'
  const temperature = parseFloat(
    params.config.get<string>('HUNYUAN_MULTIMODAL_TEMPERATURE') || '0.1',
  )
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: 'text', text: params.prompt },
  ]
  for (const url of params.imageDataUrls) {
    content.push({ type: 'image_url', image_url: { url } })
  }
  return {
    model,
    messages: [{ role: 'user', content }],
    temperature: Number.isFinite(temperature) ? temperature : 0.1,
  }
}

async function postHunyuanOpenAiVision(params: {
  config: ConfigService
  body: ReturnType<typeof buildHunyuanVisionRequestBody>
}): Promise<{
  text: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}> {
  const apiKey = resolveHunyuanVisionApiKey(params.config)
  if (!apiKey) {
    throw new Error('混元 OpenAI 多模态：缺少 HUNYUAN_VISION_API_KEY（sk- 开头 API Key）')
  }
  const url =
    params.config.get<string>('HUNYUAN_OPENAI_BASE_URL')?.trim() ||
    HUNYUAN_OPENAI_CHAT_COMPLETIONS_URL_DEFAULT
  const timeoutMs = parseInt(params.config.get<string>('HUNYUAN_OPENAI_TIMEOUT_MS') || '180000', 10)
  const timeout = Number.isFinite(timeoutMs) && timeoutMs >= 10_000 ? timeoutMs : 180_000

  try {
    const { data, status } = await axios.post<Record<string, unknown>>(url, params.body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout,
      validateStatus: () => true,
    })

    if (status < 200 || status >= 300) {
      const errBody = typeof data === 'object' && data && 'error' in data ? (data as any).error : data
      const raw = JSON.stringify(errBody)
      throw new Error(`混元 API HTTP ${status}：${sanitizeErrorMessageForClient(raw, 1200)}`)
    }

    const err = (data as any)?.error
    if (err?.message) {
      throw new Error(`混元 API：${sanitizeErrorMessageForClient(String(err.message), 1200)}`)
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
      completionTokens:
        typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : undefined,
      totalTokens: typeof usage?.total_tokens === 'number' ? usage.total_tokens : undefined,
    }
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const raw = e.response?.data != null ? JSON.stringify(e.response.data) : e.message
      const msg = sanitizeErrorMessageForClient(String(raw), 1200)
      logger.warn(`混元 OpenAI 请求失败: ${msg}`)
      throw new Error(`混元 OpenAI 请求失败: ${msg}`)
    }
    throw e
  }
}

/** 多张 PNG/JPEG 分批送混元（单页/小批），避免整本 PDF Base64 过大 */
export async function runHunyuanOpenAiVisionChatFromImages(params: {
  config: ConfigService
  images: Array<{ buffer: Buffer; mime?: string }>
  prompt: string
}): Promise<{
  text: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}> {
  if (!params.images.length) {
    throw new Error('混元多模态：未提供任何页面图像')
  }
  const maxImageMb = parseInt(params.config.get<string>('HUNYUAN_COS_MULTIMODAL_MAX_IMAGE_MB') || '18', 10)
  const maxImageBytes =
    Number.isFinite(maxImageMb) && maxImageMb > 0 ? maxImageMb * 1024 * 1024 : 18 * 1024 * 1024
  const dataUrls = params.images.map((img) => {
    if (img.buffer.length > maxImageBytes) {
      throw new Error(
        `混元多模态：单页图像 ${(img.buffer.length / (1024 * 1024)).toFixed(1)}MB 超过上限 ${maxImageMb}MB`,
      )
    }
    const mime = img.mime || 'image/png'
    return `data:${mime};base64,${img.buffer.toString('base64')}`
  })
  const body = buildHunyuanVisionRequestBody({
    config: params.config,
    prompt: params.prompt,
    imageDataUrls: dataUrls,
  })
  return postHunyuanOpenAiVision({ config: params.config, body })
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
  if (
    params.fileKind === 'pdf' &&
    isPdfTooLargeForHunyuanWholeFileBase64(params.config, buf.length)
  ) {
    throw new Error(
      `PDF 体积 ${(buf.length / (1024 * 1024)).toFixed(1)}MB 超过整本直传混元上限（HUNYUAN_PDF_WHOLE_FILE_MAX_MB），请使用分页渲染链路（FILE_PARSE_PDF_PAGED_VISION 或自动分页）`,
    )
  }
  const mime = guessMimeFromPath(lp, params.fileKind)
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
  const body = buildHunyuanVisionRequestBody({
    config: params.config,
    prompt: params.prompt,
    imageDataUrls: [dataUrl],
  })
  return postHunyuanOpenAiVision({ config: params.config, body })
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
    if (isPdfTooLargeForHunyuanWholeFileBase64(config, fileBytes)) {
      logger.warn(
        `Hunyuan OpenAI multimodal: PDF ${(fileBytes / (1024 * 1024)).toFixed(1)}MB 超过整本 Base64 直传上限，需分页渲染`,
      )
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

/** 混元输出是否像「套模板」的占位正文（与交互稿内容无关） */
export function isGenericHunyuanPlaceholderOutput(text: string): boolean {
  const t = text.trim()
  if (t.length < 80) return false
  const hits = [
    /\b模块1\b/,
    /\b接口1\b/,
    /页面名称[：:]\s*UI设计图/,
    /以上是对该/ui,
    /请根据具体情况和实际需求进行进一步调整/,
    /\| 模块1\s+\|/,
    /\| 接口1\s+\|/,
  ]
  const matched = hits.filter((re) => re.test(t)).length
  return matched >= 2
}

/**
 * PDF 分页截图：只做「所见即所得」转录，禁止七段式模板与占位符（供 FILE_PARSE 上传解析）。
 */
export function buildPdfPagedVisionExtractionPrompt(pageFrom: number, pageTo: number): string {
  const rangeLabel = pageFrom === pageTo ? `第 ${pageFrom} 页` : `第 ${pageFrom}-${pageTo} 页`
  return `你是交互稿/需求文档视觉转录助手。附图是 PDF ${rangeLabel} 的截图（可能含中文标注、版本表、多状态 UI 线框、储值卡/商品卡片等）。

任务：忠实转录图中实际可见的文字与 UI 结构，供后续需求分析。不要写需求分析报告总结。

硬性规则：
1. 只写图中能看清的内容；看不清写「未能识别」，禁止编造。
2. 禁止使用「模块1」「接口1」「UI设计图」「流程图模块」等图中未出现的泛化占位措辞。
3. 不要套用固定七段式需求报告模板；不要写「以上是对…全面分析」类结尾。
4. 保留原文用词：产品/组件名、状态名（如商品已生效/未生效/已完结）、按钮文案、版本号、表格单元格、标注线文字。
5. 示意图说明：组件类型、文案、标签位置、不同状态差异、标注线含义。
6. 表格尽量还原为 Markdown 表格。

输出 Markdown，以「## ${rangeLabel} 转录」开头。`
}

export function buildStructuredRequirementPrompt(fileKind: 'image' | 'pdf'): string {
  const docLabel = fileKind === 'image' ? 'UI设计图' : 'PDF文档'
  return `你是资深产品需求分析师，请仔细分析这份${docLabel}，输出结构化需求分析报告。

必须先基于图中/文档中实际可见的内容填写；若某节在材料中不存在，写「本材料未涉及」而不是编造模块名、接口路径或按钮。

禁止：模块1/接口1 等占位符、未出现的页面名称、泛泛的「流程图/导航栏」堆砌、结尾「以上是对…全面分析」。

请按以下结构输出（仅写有依据的内容）：

# 一、页面/文档功能概述
# 二、核心功能模块（表格：模块名称须来自材料原文）
# 三、交互逻辑说明
# 四、UI元素与布局
# 五、非功能需求（无则写未涉及）
# 六、接口需求（无则写未涉及）
# 七、风险与建议`
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

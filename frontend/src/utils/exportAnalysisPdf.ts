/**
 * AI 需求分析报告 PDF：由后端 pdfkit 生成专业排版，前端仅负责下载 Blob。
 */
import { saveAs } from 'file-saver'
import { useAuthStore } from '@/store/authStore'
import { getApiBaseUrl } from '@/utils/apiBaseUrl'

export interface ExportAnalysisPdfPayload {
  recordId?: string
  markdown: string
  documentTitle?: string
  version?: string
  /** 与 markdown 中 \`\`\`mermaid 块顺序对应的 PNG base64（无 data URL 前缀） */
  mermaidImagesBase64?: string[]
}

/** 去掉扩展名后的安全主文件名，用于拼接导出文件名 */
export function buildAnalysisExportBasename(originalName?: string | null): string {
  const raw = originalName?.trim() || '需求分析报告'
  const safe = raw.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
  const withoutExt = safe.replace(/\.[^./\\]+$/i, '')
  return withoutExt || safe
}

export function formatAnalysisExportDateChinese(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}年${m}月${day}日`
}

export function buildAnalysisPdfFileName(originalName?: string | null): string {
  const base = buildAnalysisExportBasename(originalName)
  return `${base}需求分析${formatAnalysisExportDateChinese()}.pdf`
}

export function buildAnalysisXmindFileName(originalName?: string | null): string {
  const base = buildAnalysisExportBasename(originalName)
  return `${base}需求分析${formatAnalysisExportDateChinese()}.xmind`
}

/** 调用后端 POST /ai/analyze/export-pdf，返回 PDF Blob（不走 JSON 封装 axios，避免拦截器解析失败） */
export async function downloadAnalysisReportPdf(payload: ExportAnalysisPdfPayload): Promise<Blob> {
  const token = useAuthStore.getState().token
  const base = getApiBaseUrl()
  const res = await fetch(`${base}/ai/analyze/export-pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = (await res.json()) as { message?: string }
      if (typeof j.message === 'string') msg = j.message
    } catch {
      const t = await res.text()
      if (t) msg = t.slice(0, 200)
    }
    throw new Error(msg)
  }

  return res.blob()
}

/** 生成 PDF 并触发浏览器下载 */
export async function saveAnalysisReportPdf(
  payload: ExportAnalysisPdfPayload,
  fileName: string,
): Promise<void> {
  const blob = await downloadAnalysisReportPdf(payload)
  saveAs(blob, fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`)
}

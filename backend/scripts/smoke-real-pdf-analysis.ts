import * as fs from 'fs'
import * as path from 'path'

type ApiEnvelope<T> = { code?: number; data?: T; message?: string } | T

const baseUrl = (process.env.SMOKE_API_BASE_URL || 'http://127.0.0.1:3000/api').replace(/\/+$/, '')
const username = process.env.SMOKE_USERNAME || process.env.SMOKE_EMAIL || ''
const password = process.env.SMOKE_PASSWORD || ''
const pdfPath = process.env.SMOKE_PDF_PATH || ''
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 300_000)

function requireEnv() {
  const missing = [
    !username ? 'SMOKE_USERNAME 或 SMOKE_EMAIL' : '',
    !password ? 'SMOKE_PASSWORD' : '',
    !pdfPath ? 'SMOKE_PDF_PATH' : '',
  ].filter(Boolean)
  if (missing.length) {
    throw new Error(`缺少真实 PDF smoke 环境变量：${missing.join(', ')}`)
  }
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`SMOKE_PDF_PATH 不存在：${pdfPath}`)
  }
}

function unwrap<T>(payload: ApiEnvelope<T>): T {
  if (payload && typeof payload === 'object' && 'data' in payload) return (payload as { data: T }).data
  return payload as T
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl}${url}`, init)
  const text = await res.text()
  const body = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const msg = body?.message || body?.error || text || res.statusText
    throw new Error(`${init.method || 'GET'} ${url} failed: ${res.status} ${msg}`)
  }
  return unwrap<T>(body)
}

async function waitForParsed(fileId: string, token: string) {
  const deadline = Date.now() + timeoutMs
  let lastStage = ''
  while (Date.now() < deadline) {
    const file = await api<{ id: string; status: string; parseStage?: string; parseError?: string }>(
      `/files/${encodeURIComponent(fileId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    lastStage = file.parseStage || file.status
    if (file.status === 'PARSED') return file
    if (file.status === 'FAILED') throw new Error(`PDF 解析失败：${file.parseError || lastStage}`)
    await new Promise((resolve) => setTimeout(resolve, 2500))
  }
  throw new Error(`等待 PDF 解析超时，最后阶段：${lastStage}`)
}

async function runAnalysis(fileId: string, token: string): Promise<string> {
  const res = await fetch(`${baseUrl}/ai/analyze/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sourceType: 'file',
      fileId,
      maxTokens: 8192,
      customPrompt:
        '请输出结构化需求分析报告，并确保包含 REQ-ID、TP-ID、待确认问题、质量评分和流程路径信息。',
    }),
  })
  if (!res.ok || !res.body) throw new Error(`AI 分析流启动失败：${res.status} ${res.statusText}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''
    for (const event of events) {
      if (!event.startsWith('data:')) continue
      const line = event.replace(/^data:\s*/m, '').trim()
      if (!line || line === '[DONE]') continue
      const payload = JSON.parse(line)
      if (payload.content) content += payload.content
      if (payload.error) throw new Error(`AI 分析失败：${payload.error}`)
    }
  }
  return content
}

async function main() {
  requireEnv()
  const login = await api<{ accessToken?: string; token?: string }>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const token = login.accessToken || login.token
  if (!token) throw new Error('登录响应中没有 accessToken')

  const file = new File([fs.readFileSync(pdfPath)], path.basename(pdfPath), { type: 'application/pdf' })
  const form = new FormData()
  form.append('file', file)
  const uploaded = await api<{ id: string }>('/files/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  await waitForParsed(uploaded.id, token)
  const content = await runAnalysis(uploaded.id, token)
  if (!/REQ-\d{3}/.test(content)) throw new Error('AI 分析结果未包含 REQ-ID')
  if (!/TP-\d{3}/.test(content)) throw new Error('AI 分析结果未包含 TP-ID')
  console.log(`真实 PDF smoke 通过：fileId=${uploaded.id}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

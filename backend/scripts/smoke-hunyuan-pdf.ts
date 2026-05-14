/**
 * E2E 冒烟：上传视觉型 PDF，轮询解析进度，验证混元主链路是否跑通。
 *
 * 用法：
 *   SMOKE_BASE_URL=http://localhost:3000/api \
 *   SMOKE_USERNAME=admin \
 *   SMOKE_PASSWORD=xxx \
 *   SMOKE_PDF_PATH=/abs/path/to/visual-flow.pdf \
 *   pnpm smoke:hunyuan-pdf
 *
 * 也可直接提供 token：
 *   SMOKE_TOKEN=eyJ... SMOKE_PDF_PATH=/abs/path/to/file.pdf pnpm smoke:hunyuan-pdf
 */
import * as fs from 'fs'
import * as path from 'path'

type ApiResp<T> = { code: number; message?: string; data: T }

type UploadedFileDto = {
  id: string
  status: 'PENDING' | 'PARSING' | 'PARSED' | 'FAILED'
  parseStage?: string | null
  parseProgress?: Record<string, unknown> | null
  parseError?: string | null
  parsedContent?: string | null
  originalName?: string
}

function env(name: string): string | undefined {
  const v = process.env[name]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function mustEnv(name: string): string {
  const v = env(name)
  if (!v) throw new Error(`Missing env ${name}`)
  return v
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (v == null) return fallback
  return v === '1' || v.toLowerCase() === 'true'
}

async function parseJson<T>(resp: Response, label: string): Promise<T> {
  const txt = await resp.text()
  let json: unknown
  try {
    json = txt ? JSON.parse(txt) : {}
  } catch {
    throw new Error(`${label} non-json response: ${txt.slice(0, 400)}`)
  }
  if (!resp.ok) {
    throw new Error(`${label} failed: status=${resp.status}, body=${JSON.stringify(json).slice(0, 800)}`)
  }
  return json as T
}

async function login(base: string): Promise<string> {
  const direct = env('SMOKE_TOKEN')
  if (direct) return direct

  const username = mustEnv('SMOKE_USERNAME')
  const password = mustEnv('SMOKE_PASSWORD')

  const resp = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const body = await parseJson<ApiResp<{ accessToken: string }>>(resp, 'POST /auth/login')
  if (body.code !== 0 || !body.data?.accessToken) {
    throw new Error(`POST /auth/login api error: ${JSON.stringify(body).slice(0, 800)}`)
  }
  return body.data.accessToken
}

async function uploadPdf(base: string, token: string, pdfPath: string): Promise<UploadedFileDto> {
  const bytes = fs.readFileSync(pdfPath)
  const mimeType = pdfPath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mimeType }), path.basename(pdfPath))

  const resp = await fetch(`${base}/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const body = await parseJson<ApiResp<UploadedFileDto>>(resp, 'POST /files/upload')
  if (body.code !== 0 || !body.data?.id) {
    throw new Error(`POST /files/upload api error: ${JSON.stringify(body).slice(0, 800)}`)
  }
  return body.data
}

async function getFile(base: string, token: string, fileId: string): Promise<UploadedFileDto> {
  const resp = await fetch(`${base}/files/${fileId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await parseJson<ApiResp<UploadedFileDto>>(resp, `GET /files/${fileId}`)
  if (body.code !== 0 || !body.data?.id) {
    throw new Error(`GET /files/${fileId} api error: ${JSON.stringify(body).slice(0, 800)}`)
  }
  return body.data
}

function printUsage() {
  // eslint-disable-next-line no-console
  console.log(`Usage:
  SMOKE_PDF_PATH=/abs/path/to/file.pdf [SMOKE_TOKEN=...] pnpm smoke:hunyuan-pdf
  or
  SMOKE_PDF_PATH=/abs/path/to/file.pdf SMOKE_USERNAME=... SMOKE_PASSWORD=... pnpm smoke:hunyuan-pdf

Optional env:
  SMOKE_BASE_URL=http://localhost:3000/api
  SMOKE_PARSE_TIMEOUT_SEC=360
  SMOKE_POLL_INTERVAL_MS=2000
  SMOKE_EXPECT_PARSED=1 (default)  // 设为 0 可只观察流程不强制成功`)
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage()
    return
  }

  const base = (env('SMOKE_BASE_URL') || 'http://localhost:3000/api').replace(/\/+$/, '')
  const pdfPath = mustEnv('SMOKE_PDF_PATH')
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`SMOKE_PDF_PATH not found: ${pdfPath}`)
  }

  const expectParsed = parseBool(env('SMOKE_EXPECT_PARSED'), true)
  const timeoutSec = Number(env('SMOKE_PARSE_TIMEOUT_SEC') || 360)
  const pollMs = Number(env('SMOKE_POLL_INTERVAL_MS') || 2000)
  const timeoutAt = Date.now() + Math.max(30, timeoutSec) * 1000

  const token = await login(base)
  const uploaded = await uploadPdf(base, token, pdfPath)
  // eslint-disable-next-line no-console
  console.log('[smoke:hunyuan-pdf] uploaded', {
    id: uploaded.id,
    name: uploaded.originalName || path.basename(pdfPath),
    status: uploaded.status,
  })

  let lastStage: string | null | undefined
  let lastStatus: UploadedFileDto['status'] | undefined
  while (Date.now() < timeoutAt) {
    const row = await getFile(base, token, uploaded.id)
    if (row.status !== lastStatus || row.parseStage !== lastStage) {
      lastStatus = row.status
      lastStage = row.parseStage
      // eslint-disable-next-line no-console
      console.log('[smoke:hunyuan-pdf] progress', {
        status: row.status,
        stage: row.parseStage,
        progress: row.parseProgress || null,
      })
    }
    if (row.status === 'PARSED') {
      // eslint-disable-next-line no-console
      console.log('[smoke:hunyuan-pdf] done', {
        chars: row.parsedContent?.length ?? 0,
        stage: row.parseStage,
      })
      return
    }
    if (row.status === 'FAILED') {
      if (expectParsed) {
        throw new Error(
          `Parse failed: stage=${row.parseStage}, error=${(row.parseError || 'unknown').slice(0, 900)}`,
        )
      }
      // eslint-disable-next-line no-console
      console.log('[smoke:hunyuan-pdf] failed (accepted)', {
        stage: row.parseStage,
        error: row.parseError || null,
      })
      return
    }
    await sleep(Math.max(500, pollMs))
  }

  throw new Error(`Timeout waiting parse result (> ${timeoutSec}s)`)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[smoke:hunyuan-pdf] failed', e)
  process.exit(1)
})

/**
 * 调试单个文件解析链路（上传后卡住/502/阶段不推进）：
 * - 登录/鉴权检查
 * - /health 与 /files/:id 基础可达性
 * - /files/:id/parse-events 探活（SSE）
 * - 触发重试解析（可选）
 * - 轮询状态，若长时间卡 CLAIMED 可自动 cancel+retry 一次
 *
 * 用法：
 *   DEBUG_FILE_ID=<fileId> DEBUG_BASE_URL=http://127.0.0.1:8083/api \
 *   DEBUG_USERNAME=admin@example.com DEBUG_PASSWORD=xxx \
 *   pnpm debug:file-parse
 *
 * 或直接给 token：
 *   DEBUG_FILE_ID=<fileId> DEBUG_TOKEN=eyJ... pnpm debug:file-parse
 */

type ApiResp<T> = { code: number; message?: string; data: T }

type UploadedFileDto = {
  id: string
  status: 'PENDING' | 'PARSING' | 'PARSED' | 'FAILED'
  parseStage?: string | null
  parseProgress?: Record<string, unknown> | null
  parseError?: string | null
  parsedContent?: string | null
  originalName?: string
  path?: string | null
  updatedAt?: string
  lastHeartbeatAt?: string | null
  parseFinishedAt?: string | null
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
    throw new Error(`${label} non-json response: status=${resp.status}, body=${txt.slice(0, 500)}`)
  }
  if (!resp.ok) {
    throw new Error(`${label} failed: status=${resp.status}, body=${JSON.stringify(json).slice(0, 900)}`)
  }
  return json as T
}

async function login(base: string): Promise<string> {
  const direct = env('DEBUG_TOKEN')
  if (direct) return direct
  const username = mustEnv('DEBUG_USERNAME')
  const password = mustEnv('DEBUG_PASSWORD')
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

async function getHealth(base: string): Promise<void> {
  const healthBase = base.replace(/\/api\/?$/, '')
  const resp = await fetch(`${healthBase}/health`)
  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`/health failed: status=${resp.status}, body=${txt.slice(0, 300)}`)
  }
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

async function triggerParse(base: string, token: string, fileId: string): Promise<UploadedFileDto> {
  const resp = await fetch(`${base}/files/${fileId}/parse`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const body = await parseJson<ApiResp<UploadedFileDto>>(resp, `POST /files/${fileId}/parse`)
  if (body.code !== 0 || !body.data?.id) {
    throw new Error(`POST /files/${fileId}/parse api error: ${JSON.stringify(body).slice(0, 800)}`)
  }
  return body.data
}

async function cancelParse(base: string, token: string, fileId: string): Promise<void> {
  const resp = await fetch(`${base}/files/${fileId}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await parseJson<ApiResp<UploadedFileDto>>(resp, `POST /files/${fileId}/cancel`)
  if (body.code !== 0) {
    throw new Error(`POST /files/${fileId}/cancel api error: ${JSON.stringify(body).slice(0, 800)}`)
  }
}

async function probeParseEvents(base: string, token: string, fileId: string): Promise<void> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 5000)
  try {
    const resp = await fetch(`${base}/files/${fileId}/parse-events`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    if (!resp.ok) {
      const txt = await resp.text()
      throw new Error(`GET /files/${fileId}/parse-events failed: status=${resp.status}, body=${txt.slice(0, 300)}`)
    }
  } finally {
    clearTimeout(t)
  }
}

function printTipsByError(errMsg: string): void {
  const msg = errMsg.toLowerCase()
  if (msg.includes('canvas.node') || msg.includes('cannot find module') && msg.includes('canvas')) {
    console.log('[debug:file-parse] tip: canvas 缺失。可先设 FILE_PARSE_PDF_PAGED_VISION=0，或重建包含 canvas 的 backend 镜像。')
    return
  }
  if (msg.includes('cos 下载超时') || msg.includes('从 cos 下载失败')) {
    console.log('[debug:file-parse] tip: COS 下载异常。检查对象权限/网络，并可增大 COS_DOWNLOAD_TIMEOUT_MS（如 180000）。')
    return
  }
  if (msg.includes('未授权')) {
    console.log('[debug:file-parse] tip: token 失效。请重新登录获取 DEBUG_TOKEN。')
  }
}

function printUsage() {
  // eslint-disable-next-line no-console
  console.log(`Usage:
  DEBUG_FILE_ID=<fileId> [DEBUG_TOKEN=...] pnpm debug:file-parse
  or
  DEBUG_FILE_ID=<fileId> DEBUG_USERNAME=... DEBUG_PASSWORD=... pnpm debug:file-parse

Optional env:
  DEBUG_BASE_URL=http://127.0.0.1:8083/api
  DEBUG_PARSE_TIMEOUT_SEC=420
  DEBUG_POLL_INTERVAL_MS=2000
  DEBUG_TRIGGER_PARSE=1           (default 1)
  DEBUG_AUTO_CANCEL_RETRY=1       (default 1)
  DEBUG_STUCK_CLAIMED_SEC=90
  DEBUG_EXPECT_PARSED=1           (default 1)`)
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage()
    return
  }

  const base = (env('DEBUG_BASE_URL') || 'http://127.0.0.1:8083/api').replace(/\/+$/, '')
  const fileId = mustEnv('DEBUG_FILE_ID')
  const timeoutSec = Number(env('DEBUG_PARSE_TIMEOUT_SEC') || 420)
  const pollMs = Number(env('DEBUG_POLL_INTERVAL_MS') || 2000)
  const triggerOnStart = parseBool(env('DEBUG_TRIGGER_PARSE'), true)
  const autoCancelRetry = parseBool(env('DEBUG_AUTO_CANCEL_RETRY'), true)
  const expectParsed = parseBool(env('DEBUG_EXPECT_PARSED'), true)
  const stuckClaimedSec = Number(env('DEBUG_STUCK_CLAIMED_SEC') || 90)
  const timeoutAt = Date.now() + Math.max(30, timeoutSec) * 1000

  const token = await login(base)
  await getHealth(base)
  await probeParseEvents(base, token, fileId)

  let row = await getFile(base, token, fileId)
  // eslint-disable-next-line no-console
  console.log('[debug:file-parse] file', {
    id: row.id,
    name: row.originalName,
    path: row.path,
    status: row.status,
    stage: row.parseStage,
    err: row.parseError || null,
  })

  if (triggerOnStart) {
    row = await triggerParse(base, token, fileId)
    // eslint-disable-next-line no-console
    console.log('[debug:file-parse] parse triggered', {
      status: row.status,
      stage: row.parseStage,
    })
  }

  let lastStatus: string | undefined
  let lastStage: string | null | undefined
  let claimedSince = 0
  let retriedClaimedOnce = false

  while (Date.now() < timeoutAt) {
    row = await getFile(base, token, fileId)
    if (row.status !== lastStatus || row.parseStage !== lastStage) {
      lastStatus = row.status
      lastStage = row.parseStage
      // eslint-disable-next-line no-console
      console.log('[debug:file-parse] progress', {
        status: row.status,
        stage: row.parseStage,
        heartbeat: row.lastHeartbeatAt || null,
        err: row.parseError || null,
      })
    }

    if (row.status === 'PARSED') {
      // eslint-disable-next-line no-console
      console.log('[debug:file-parse] done', {
        stage: row.parseStage,
        chars: row.parsedContent?.length ?? 0,
      })
      return
    }

    if (row.status === 'FAILED') {
      const brief = (row.parseError || 'unknown').slice(0, 1200)
      printTipsByError(brief)
      if (expectParsed) {
        throw new Error(`Parse failed: stage=${row.parseStage}, error=${brief}`)
      }
      // eslint-disable-next-line no-console
      console.log('[debug:file-parse] failed (accepted)', { stage: row.parseStage, error: brief })
      return
    }

    if (row.status === 'PARSING' && row.parseStage === 'CLAIMED') {
      if (!claimedSince) claimedSince = Date.now()
      const claimedElapsed = (Date.now() - claimedSince) / 1000
      if (autoCancelRetry && !retriedClaimedOnce && claimedElapsed >= Math.max(20, stuckClaimedSec)) {
        // eslint-disable-next-line no-console
        console.log('[debug:file-parse] stuck at CLAIMED, auto cancel+retry once')
        await cancelParse(base, token, fileId)
        await triggerParse(base, token, fileId)
        retriedClaimedOnce = true
        claimedSince = Date.now()
      }
    } else {
      claimedSince = 0
    }

    await sleep(Math.max(500, pollMs))
  }

  throw new Error(`Timeout waiting parse result (> ${timeoutSec}s)`)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[debug:file-parse] failed', e)
  process.exit(1)
})


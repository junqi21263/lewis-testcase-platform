const IMAGE_EXT = /\.(avif|gif|jpe?g|png|svg|webp)(\?.*)?$/i

function tryParseUrl(raw: string): URL | null {
  const s = (raw || '').trim()
  if (!s) return null
  try {
    return new URL(s.startsWith('http') ? s : `https://${s}`)
  } catch {
    return null
  }
}

export function isDirectAvatarImageUrl(raw: string): boolean {
  const url = tryParseUrl(raw)
  if (!url) return IMAGE_EXT.test(raw)
  if (url.hostname === 'i.ibb.co' || url.hostname === 'i.imgur.com') return true
  return IMAGE_EXT.test(url.pathname)
}

function isAvatarHostingPageUrl(raw: string): boolean {
  const url = tryParseUrl(raw)
  if (!url) return false
  return url.hostname === 'ibb.co' || url.hostname === 'imgbb.com' || url.hostname === 'www.imgbb.com'
}

async function fetchOgImageUrl(pageUrl: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const res = await fetch(pageUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TestcasePlatform/1.0; +avatar-resolve)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) return null
    const html = await res.text()
    const patterns = [
      /property=["']og:image["']\s+content=["']([^"']+)["']/i,
      /content=["']([^"']+)["']\s+property=["']og:image["']/i,
      /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    ]
    for (const re of patterns) {
      const m = html.match(re)
      if (m?.[1]?.startsWith('http')) return m[1].trim()
    }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 将用户填写的头像链接规范为可给 <img src> 使用的直链（必要时抓取图床页面 og:image）。
 */
export async function resolveAvatarUrlForStorage(input?: string | null): Promise<string | null> {
  const raw = (input ?? '').trim()
  if (!raw) return null
  if (isDirectAvatarImageUrl(raw)) return raw.slice(0, 500)

  if (isAvatarHostingPageUrl(raw)) {
    const direct = await fetchOgImageUrl(raw)
    if (direct && isDirectAvatarImageUrl(direct)) return direct.slice(0, 500)
    throw new Error(
      '无法从该图床页面解析头像直链，请在 ImgBB 复制「直接链接」(形如 https://i.ibb.co/.../xxx.png)',
    )
  }

  return raw.slice(0, 500)
}

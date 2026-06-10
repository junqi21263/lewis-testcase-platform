const IMAGE_EXT = /\.(avif|gif|jpe?g|png|svg|webp)(\?.*)?$/i

function tryParseUrl(raw: string): URL | null {
  const s = raw.trim()
  if (!s) return null
  try {
    return new URL(s.startsWith('http') ? s : `https://${s}`)
  } catch {
    return null
  }
}

/** 供 AvatarImage 使用的 src；图床「页面链接」需后端解析后存库 */
export function resolveAvatarDisplayUrl(raw?: string | null): string | undefined {
  const u = (raw ?? '').trim()
  if (!u) return undefined
  const url = tryParseUrl(u)
  if (!url) return IMAGE_EXT.test(u) ? u : undefined
  if (url.hostname === 'i.ibb.co' || url.hostname === 'i.imgur.com') return url.toString()
  if (IMAGE_EXT.test(url.pathname)) return url.toString()
  if (url.hostname === 'ibb.co' || url.hostname === 'imgbb.com') return undefined
  return url.toString()
}

export function isAvatarHostingPageUrl(raw?: string | null): boolean {
  const u = (raw ?? '').trim()
  if (!u) return false
  const url = tryParseUrl(u)
  if (!url) return false
  return url.hostname === 'ibb.co' || url.hostname === 'imgbb.com' || url.hostname === 'www.imgbb.com'
}

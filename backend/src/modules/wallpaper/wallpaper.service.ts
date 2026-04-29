import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import axios from 'axios'
import { PreferencesService } from '@/modules/preferences/preferences.service'

type BingArchiveResponse = {
  images?: Array<{
    url?: string
    urlbase?: string
    title?: string
    copyright?: string
    hsh?: string
  }>
}

@Injectable()
export class WallpaperService {
  constructor(private prefs: PreferencesService) {}

  private bingApiUrl(idx: number): string {
    const mkt = process.env.WALLPAPER_BING_MKT || 'zh-CN'
    const uhd = process.env.WALLPAPER_BING_UHD === '0' ? '0' : '1'
    const i = Math.max(0, Math.min(7, Math.floor(idx)))
    return `https://www.bing.com/HPImageArchive.aspx?format=js&idx=${i}&n=1&mkt=${encodeURIComponent(
      mkt,
    )}&uhd=${encodeURIComponent(uhd)}`
  }

  /** variedIdx：手动「换一张」时用不同 idx，否则 Bing 始终返回同一张「今日」图，URL 不变前端看起来像没换 */
  private async fetchBingOne(opts?: { variedIdx?: boolean }): Promise<{
    url: string
    title?: string
    copyright?: string
  }> {
    const idx = opts?.variedIdx ? Math.floor(Math.random() * 8) : 0
    const { data } = await axios.get<BingArchiveResponse>(this.bingApiUrl(idx), {
      timeout: 10_000,
      headers: { 'User-Agent': 'lewis-testcase-platform/1.0' },
    })
    const img = data?.images?.[0]
    const path = img?.url
    if (!path) throw new ServiceUnavailableException('壁纸服务暂不可用（Bing 响应缺少 url）')
    const url = path.startsWith('http') ? path : `https://www.bing.com${path}`
    return { url, title: img.title, copyright: img.copyright }
  }

  async getNextForUser(userId: string, opts?: { force?: boolean }) {
    const pref = await this.prefs.getOrCreate(userId)
    if (!pref.wallpaperEnabled) {
      return { enabled: false, url: null as string | null }
    }

    const intervalSec = Math.max(0, pref.wallpaperIntervalSec || 0)
    const force = !!opts?.force

    if (!force && pref.wallpaperCurrentUrl) {
      if (intervalSec <= 0) {
        return {
          enabled: true,
          url: pref.wallpaperCurrentUrl,
          title: null as string | null,
          copyright: null as string | null,
          rotated: false,
        }
      }
      if (pref.wallpaperLastAt) {
        const ageMs = Date.now() - pref.wallpaperLastAt.getTime()
        if (ageMs < intervalSec * 1000) {
          return {
            enabled: true,
            url: pref.wallpaperCurrentUrl,
            title: null as string | null,
            copyright: null as string | null,
            rotated: false,
          }
        }
      }
    }

    // 定时更换时也用随机 idx，否则长期只会拿到「今日」同一张
    const img = await this.fetchBingOne({ variedIdx: force || intervalSec > 0 })

    await this.prefs.update(userId, {
      wallpaperProvider: 'bing',
    })
    await this.prefs.setWallpaperCurrent(userId, { url: img.url, at: new Date() })

    return {
      enabled: true,
      url: img.url,
      title: img.title ?? null,
      copyright: img.copyright ?? null,
      rotated: true,
    }
  }
}


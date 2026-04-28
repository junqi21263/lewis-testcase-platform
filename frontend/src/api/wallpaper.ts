import { request } from '@/utils/request'

export interface WallpaperNextResponse {
  enabled: boolean
  url: string | null
  title?: string | null
  copyright?: string | null
  rotated?: boolean
}

export const wallpaperApi = {
  next: (opts?: { force?: boolean }) =>
    request.get<WallpaperNextResponse>('/wallpaper/next', {
      params: { force: opts?.force ? 1 : undefined },
    }),
}


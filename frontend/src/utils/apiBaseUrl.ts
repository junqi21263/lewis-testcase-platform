import { RAILWAY_API_BASE_DEFAULT } from '@/config/deploy'

/** 去掉末尾 `/`，约定 base 已含 Nest 的 `globalPrefix`（即必须以 `/api` 结尾） */
function normalizeApiBase(url: string): string {
  const t = url.trim().replace(/\/+$/, '')
  return t || '/api'
}

export function getApiBaseUrl(): string {
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL
  if (envBaseUrl && envBaseUrl.trim()) {
    return normalizeApiBase(envBaseUrl)
  }

  if (typeof window !== 'undefined' && window.location.hostname.endsWith('edgeone.cool')) {
    return normalizeApiBase(RAILWAY_API_BASE_DEFAULT)
  }

  return '/api'
}


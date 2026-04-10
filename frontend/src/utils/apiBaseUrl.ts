const DEFAULT_API_BASE_URL = 'https://lewis-testcase-platform-production.up.railway.app/api'

export function getApiBaseUrl(): string {
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL
  if (envBaseUrl && envBaseUrl.trim()) {
    return envBaseUrl
  }

  if (typeof window !== 'undefined' && window.location.hostname.endsWith('edgeone.cool')) {
    return DEFAULT_API_BASE_URL
  }

  return '/api'
}


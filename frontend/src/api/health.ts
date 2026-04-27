import { request } from '@/utils/request'

export type HealthStatus = {
  status: 'ok'
  workerEnabled: boolean
  pending: number
  parsing: number
}

export const healthApi = {
  getHealth: () => request.get<HealthStatus>('/health'),
}


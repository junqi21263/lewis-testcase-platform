/**
 * 前后端连接约定
 *
 * - 后端 Nest：`app.setGlobalPrefix('api')`，对外基址为 `https://<后端域名>/api`
 * - 前端 axios：`baseURL` 由 `VITE_API_BASE_URL` 注入；未设置时生产构建默认为同源 `/api`
 * - 静态托管（EdgeOne 等）：构建阶段务必设置 `VITE_API_BASE_URL` 为后端公网基址，或在边缘网关将 `/api` 转发至后端
 */

/** 与后端 globalPrefix 一致，仅作文档与拼接参考 */
export const API_GLOBAL_PREFIX = '/api'

/**
 * 前后端连接约定（请与 Railway / EdgeOne 实际域名保持一致）
 *
 * - 后端 Nest：`app.setGlobalPrefix('api')`，对外基址必须是 `https://<后端域名>/api`
 * - 前端 axios：`baseURL` 指向上述基址；本地 dev 未设 `VITE_API_BASE_URL` 时用 Vite 代理 `/api`
 * - 构建 EdgeOne / 生产静态资源时：务必在 CI 或 `.env.production` 设置 `VITE_API_BASE_URL`
 */

/** 与后端 globalPrefix 一致，仅作文档与拼接参考 */
export const API_GLOBAL_PREFIX = '/api'

/**
 * 未设置 `VITE_API_BASE_URL`、且页面托管在 `*.edgeone.cool` 时的兜底后端基址。
 * 须与 Railway → **后端 Web 服务** → Networking 里生成的公网域名 + `/api` 完全一致。
 *
 * 注意：`https://<项目名>.up.railway.app` 往往是「未挂任何服务」的占位，会 404 Application not found；
 * 实际多为 `https://<服务名>-production-xxxx.up.railway.app` 形式。以控制台为准。
 */
export const RAILWAY_API_BASE_DEFAULT =
  'https://lewis-testcase-platform-production.up.railway.app/api'

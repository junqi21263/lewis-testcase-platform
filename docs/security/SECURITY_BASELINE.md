# 安全基线

本文档记录当前平台的最低安全要求，适用于 develop 与 main 环境。

## 密钥与环境变量

- 不在代码、README、测试脚本或 Playwright 用例中硬编码数据库、Redis、AI 模型、COS、SMTP 密钥。
- 生产环境只通过部署平台或 VPS `.env` 注入密钥；`NODE_ENV=production` 时后端不读取磁盘 `.env`。
- AI 模型配置页只展示 `hasApiKey` 状态，不回显明文 API Key。
- 真实 PDF smoke 使用 `SMOKE_USERNAME`、`SMOKE_PASSWORD`、`SMOKE_PDF_PATH`、`SMOKE_API_BASE_URL` 注入参数。

## CORS 与反向代理

- 生产环境优先使用同源 `/api`，减少跨域暴露面。
- 若必须跨域，CORS 白名单只配置可信前端域名，不使用通配 `*` 搭配凭据。
- Nginx/网关对 SSE 接口关闭响应缓冲，避免 AI 流式输出长时间卡住。

## 依赖与镜像

- 每次合入 develop 前至少执行：
  - `pnpm -C backend test`
  - `pnpm -C backend build`
  - `pnpm -C frontend test:unit`
  - `pnpm -C frontend build`
- Docker 镜像推送后通过部署脚本拉取固定 tag，并执行容器健康检查。
- 高危依赖升级优先处理认证、文件上传、PDF/OCR、反向代理、Redis/队列相关包。

## 日志与脱敏

- 解析文件内容、AI 输入输出、模型错误、用户信息进入日志前必须做长度限制和敏感信息脱敏。
- 禁止记录 API Key、JWT、数据库 URL、SMTP 密码、COS Secret。
- AI 失败信息返回前使用统一清洗函数，避免把网关密钥、内部 URL 或堆栈透出给前端。

## 文件上传与解析

- 上传大小由 `MAX_FILE_SIZE` 控制，前端只读展示服务端值。
- PDF/OCR/多模态解析必须有超时、重试和失败落库，不能让记录永久停留在处理中。
- Redis 实时进度只保存临时状态，数据库保存最终状态和必要的低频心跳。

## Redis 与队列

- Redis 只承接缓存、实时态、轻量队列和流式快照，不作为唯一事实来源。
- Redis 不可用时，缓存/队列/快照 API 必须安全降级，不得阻断核心上传、解析、生成流程。
- 长任务最终状态必须回写数据库，页面刷新后至少能看到 DB 最终态。

## 备份与恢复

- 数据库是核心事实来源，需定期备份并保留可恢复版本。
- 上传文件若使用 COS，需确认 bucket 生命周期规则不会早于业务留存周期清理源文件。
- develop 与 main 分别对应测试和生产环境，部署脚本不得交叉使用数据库或 Redis 实例。

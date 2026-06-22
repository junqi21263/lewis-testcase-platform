# 环境变量说明

更新时间：2026-06-22

> 安全要求：不要把 `.env`、Token、私钥、数据库密码、邮件口令提交到仓库或贴到聊天/工单。

本文是高频变量索引，不替代完整模板。事实源以这些文件为准：

- 后端：`backend/.env.example`
- 前端：`frontend/.env.example`
- 全栈 Compose：`docker-compose.full.env.example`

## 1. 最小必填项

### 本地后端

- `DATABASE_URL`
- `JWT_SECRET`

### 本地前端

- `VITE_API_BASE_URL`

### 需要 AI 生成时

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `DEFAULT_AI_MODEL`

### 需要图片 / PDF 多模态解析时

至少满足以下一组：

- 混元兼容链路：`HUNYUAN_MULTIMODAL_ENABLED`、`HUNYUAN_VISION_API_KEY`、`HUNYUAN_OPENAI_BASE_URL`
- 或在系统设置中配置可用视觉模型，并通过 `VISION_PARSE_MODEL_CONFIG_ID` 指定

## 2. 前端变量

来源：`frontend/.env.example`、`frontend/.env.production`

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE_URL` | API 基址。自托管推荐 `/api`，开发可用 `/api` 或 `http://localhost:3000/api` |
| `VITE_APP_NAME` | 应用名称 |

## 3. 后端基础变量

来源：`backend/.env.example`

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串 |
| `JWT_SECRET` | JWT 签名密钥 |
| `JWT_EXPIRES_IN` | JWT 过期时间 |
| `APP_PORT` | 后端监听端口，默认 `3000` |
| `NODE_ENV` | 运行环境 |
| `THROTTLE_TTL` | 限流窗口秒数 |
| `THROTTLE_LIMIT` | 窗口内最大请求数 |
| `FRONTEND_URL` | 前端访问地址，用于邮件、分享链接、CORS 口径 |
| `CORS_ORIGINS` | 允许的浏览器来源，逗号分隔 |

## 4. 认证与邀请注册

| 变量 | 说明 |
| --- | --- |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | seed 时创建默认管理员 |
| `AUTH_ADMIN_ONLY` | 管理员模式，关闭公开注册等入口 |
| `AUTH_ALLOW_PLAINTEXT_PASSWORD` | 紧急密码救援，平时不要开启 |
| `AUTH_REGISTER_INVITE_CODE` | 邀请注册码 |
| `AUTH_CAPTCHA_TTL_SEC` | 图形验证码有效期 |

## 5. AI 文本生成

| 变量 | 说明 |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI 兼容网关密钥 |
| `OPENAI_BASE_URL` | OpenAI 兼容网关地址 |
| `DEFAULT_AI_MODEL` | 默认文本模型 |
| `AI_DEFAULT_MAX_TOKENS` | 默认生成 Token 预算 |
| `AI_MAX_OUTPUT_TOKENS` | 平台允许的最大输出预算 |
| `AI_CONTINUATION_MAX_ATTEMPTS` | 输出截断后自动续写次数 |
| `STREAM_FULL_CONTENT_MAX_CHARS` | SSE 累积 fullContent 上限 |
| `ANALYSIS_RECORD_MAX_CHARS` | 需求分析报告入库最大字符数 |

## 6. 文件上传与解析

| 变量 | 说明 |
| --- | --- |
| `UPLOAD_DIR` | 本地上传目录 |
| `MAX_FILE_SIZE` | 单文件大小上限 |
| `FILE_UPLOAD_STORAGE` | `local` 或 `cos` |
| `FILE_PARSE_WORKER_ENABLED` | 文件解析后台 worker 开关 |
| `FILE_PARSE_WORKER_INTERVAL_MS` | worker 扫描间隔 |
| `FILE_PARSE_WORKER_MAX_CONCURRENT` | 文件解析并发数 |
| `FILE_PARSE_TIMEOUT_MINUTES` | 单任务超时分钟数 |
| `FILE_PARSE_PDF_FAST_MODE` | 小 PDF 快速路径开关 |
| `FILE_PARSE_PDF_FAST_MAX_MB` | 小 PDF 快速路径大小阈值 |
| `FILE_PARSE_PDF_FAST_MAX_PAGES` | 小 PDF 快速路径页数阈值 |
| `FILE_PARSE_PDF_FAST_VISION_PAGES` | 小 PDF 快速路径最多视觉页数 |

## 7. 视觉解析 / OCR / PDF

这部分变量较多，完整说明直接看 `backend/.env.example` 注释。高频项如下：

| 变量 | 说明 |
| --- | --- |
| `VISION_PARSE_MODEL_CONFIG_ID` | 强制指定文档视觉解析模型配置 |
| `VISION_PDF_MIN_TEXT_CHARS` | PDF 文本不足时转视觉/OCR 的阈值 |
| `VISION_API_TIMEOUT_MS` | 视觉调用超时 |
| `VISION_IMAGE_TIMEOUT_MS` | 单图视觉调用超时 |
| `VISION_IMAGE_DETAIL` | `low` / `high` / `auto` |
| `IMAGE_PARSE_SKIP_OCR_WHEN_VISION_OK` | 视觉结果足够时是否跳过 OCR |
| `IMAGE_OCR_TIMEOUT_MS` | OCR 超时 |
| `OCR_LANGS` | Tesseract 语言包 |
| `PDF_OCR_SKIP_VISION` | 跳过视觉，仅走 OCR |
| `PDF_OCR_BATCH_SIZE` | PDF OCR 分页批次大小 |
| `PDF_OCR_MAX_CONCURRENT_BATCHES` | OCR 批次最大并发 |

## 8. 混元多模态

| 变量 | 说明 |
| --- | --- |
| `HUNYUAN_MULTIMODAL_ENABLED` | 开启混元多模态链路 |
| `HUNYUAN_VISION_API_KEY` | 混元 API Key |
| `HUNYUAN_OPENAI_BASE_URL` | 混元兼容 chat/completions 地址 |
| `HUNYUAN_OPENAI_TIMEOUT_MS` | 混元请求超时 |
| `HUNYUAN_MULTIMODAL_MODEL` | 混元视觉模型名 |
| `FILE_PARSE_PDF_HUNYUAN_FIRST` | PDF 上传解析优先混元 |
| `FILE_PARSE_PDF_PAGED_VISION` | PDF 分页视觉路径 |
| `FILE_PARSE_FORCE_HUNYUAN` | 文件解析强制混元 |
| `FILE_PARSE_TENCENT_OCR_FALLBACK` | 混元失败后允许腾讯 OCR 兜底 |
| `FILE_PARSE_LOCAL_OCR_FALLBACK` | 混元失败后允许本地 OCR 兜底 |

## 9. 腾讯云 COS / OCR

### COS

| 变量 | 说明 |
| --- | --- |
| `COS_SECRET_ID` / `COS_SECRET_KEY` | COS 凭证 |
| `COS_SECURITY_TOKEN` | 临时安全令牌，可选 |
| `COS_BUCKET` | COS Bucket |
| `COS_REGION` | COS 区域 |
| `COS_PREFIX` | 对象前缀 |
| `COS_PARSE_TEMP_DIR` | 解析前临时目录 |

### 腾讯 OCR

| 变量 | 说明 |
| --- | --- |
| `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY` | 腾讯 OCR SDK 凭证 |
| `TENCENT_OCR_REGION` | OCR 区域 |
| `PDF_TENCENT_SDK_PDF` | PDF 优先走腾讯 OCR SDK |
| `PDF_TENCENT_SDK_MAX_BYTES` | 本地 PDF Base64 上限 |
| `TENCENT_OCR_HTTP_URL` | 自建 OCR HTTP 服务地址 |
| `TENCENT_OCR_HTTP_TIMEOUT_MS` | HTTP OCR 超时 |

## 10. Redis 与运行态缓存

| 变量 | 说明 |
| --- | --- |
| `REDIS_URL` | Redis 连接串 |
| `TEMPLATES_LIST_CACHE_REDIS` | 模板列表缓存走 Redis |
| `TEMPLATES_LIST_CACHE_TTL_MS` | 模板列表缓存 TTL |
| `IMAGE_OCR_CACHE_ENABLED` | OCR 缓存开关 |
| `IMAGE_OCR_CACHE_TTL_DAYS` | OCR 缓存保留天数 |
| `IMAGE_OCR_CACHE_MAX_ENTRIES` | OCR 缓存数量上限 |
| `IMAGE_OCR_CACHE_MAX_TEXT_BYTES` | OCR 缓存内容上限 |

补充说明：

- Redis 当前还承担文件解析进度、AI 流式分片快照、轻量队列等运行态数据。
- 在 dev / prod 双环境同机部署时，端口通常分别是 `6380` 与 `6379`。

## 11. 多模态运行预算

| 变量 | 说明 |
| --- | --- |
| `MM_ENABLED` | 多模态运行总开关 |
| `MM_DEFAULT_MODEL` | 默认多模态模型 |
| `MM_TEXT_FALLBACK_MODEL` | 文本回退模型 |
| `MM_MAX_CONCURRENT` | 多模态最大并发 |
| `MM_CACHE_TTL_DAYS` | 多模态缓存天数 |
| `MM_MONTHLY_ALERT_CNY` | 月度成本预警阈值 |
| `MM_AUTO_DOWNGRADE_WHEN_OVER_BUDGET` | 超预算自动降级 |

## 12. 磁盘治理与轻量云清理

| 变量 | 说明 |
| --- | --- |
| `LIGHTWEIGHT_UPLOAD_RETENTION_DAYS` | 上传源文件保留天数 |
| `PDF_RETENTION_DAYS` | 上述项别名 |
| `LIGHTWEIGHT_ORPHAN_CHUNK_MAX_AGE_HOURS` | 未合并分片保留时长 |
| `LIGHTWEIGHT_MODEL_CACHE_ROOTS` | OCR/模型缓存目录 |
| `LIGHTWEIGHT_MODEL_CACHE_KEEP` | 缓存目录保留数量 |
| `LIGHTWEIGHT_DISK_THRESHOLD_PERCENT` | 磁盘阈值，超出后触发清理 |
| `DISK_CLEANUP_THRESHOLD` | 磁盘阈值别名 |
| `LIGHTWEIGHT_CLEANUP_SCRIPT_PATH` | 自定义清理脚本 |
| `APP_LOG_FILE` / `APP_LOG_DIR` | 日志文件与目录 |
| `LIGHTWEIGHT_LOG_MAX_BYTES` | 日志轮转阈值 |
| `LIGHTWEIGHT_LOG_RETENTION_DAYS` | 日志保留天数 |

## 13. Docker Compose / VPS 双环境

来源：`docker-compose.full.env.example`

| 变量 | 说明 |
| --- | --- |
| `STACK_PREFIX` | 容器名前缀，区分 develop / main |
| `FRONTEND_HOST_BIND` / `FRONTEND_HOST_PORT` | 前端宿主机监听地址与端口 |
| `POSTGRES_HOST_BIND` / `POSTGRES_HOST_PORT` | PostgreSQL 映射 |
| `REDIS_HOST_BIND` / `REDIS_HOST_PORT` | Redis 映射 |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Compose 内数据库初始化 |
| `APK_MIRROR` | Alpine 包镜像域名 |
| `DEPLOY_REGION` | `cn` / `global`，影响部署拉取策略 |

常见端口约定：

- develop：前端 `8083`，PostgreSQL `5433`，Redis `6380`
- main：前端 `80`，PostgreSQL `5432`，Redis `6379`

## 14. 邮件能力

邮件相关变量没有完全收敛到本文，完整字段直接查看 `backend/.env.example` 与 `backend/src/modules/mail/mail.service.ts` 对应实现。启用前至少确认：

- SMTP / Resend 凭证已配置
- `FRONTEND_URL` 正确
- 生产环境不要把密钥写进仓库模板

## 15. 使用建议

1. 日常开发优先查 `backend/.env.example` 与 `docker-compose.full.env.example`，本文只做索引。
2. 新增 P1 以上功能时，如果引入新环境变量，必须同时更新：
   - `backend/.env.example` 或 `frontend/.env.example`
   - 本文
   - 如涉及部署，还要更新 `docker-compose.full.env.example`
3. 不再维护“文档写一套、示例文件写一套、代码默认值再来一套”但彼此不一致的状态。

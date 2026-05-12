# 更新日志

## 2026-05-04～2026-05-11（周度摘要）

### AI 需求分析（前端 / 后端）

- **导出**：工具栏新增 **导出 XMind**（按报告章节生成 `.xmind`）；**导出 PDF** 支持将报告内 **Mermaid** 在前端渲染为 PNG 后由后端嵌入，文件名 `{原名}需求分析{YYYY年MM月DD日}`。
- **报告展示**：Markdown 报告区 **自动渲染 Mermaid**（深色主题、缩放），默认分析指令模板调整为 **六段结构化输出**（功能 / 非功能 / 接口 / 数据模型 / 业务流程含 Mermaid / 风险）。
- **界面**：流式终端与报告区布局、滚动条与审阅区交互多项优化（溢出、对齐、大屏适配）。
- **后端**：`POST /api/ai/analyze/export-pdf` 请求体可携带 `mermaidImagesBase64`；`express.json` 体积上限提高以容纳多图 Base64。

### 文件解析性能（后端）

- **图片**：单图视觉默认 **`detail: low`**、独立 **`VISION_IMAGE_TIMEOUT_MS`**；多模态已有有效正文时 **默认跳过 Tesseract**（避免大图 OCR 数分钟）；OCR 可选超时 **`IMAGE_OCR_TIMEOUT_MS`**。
- **结构化**：以「多模态视觉理解」为主的需求正文 **默认跳过第二轮「需求结构化」LLM**（可用 **`STRUCTURE_LLM_FOR_VISION_DOC=1`** 恢复）；解析阶段 heartbeat 区分 VISION / OCR / SKIP。
- 详见 `backend/.env.example` 中 `VISION_IMAGE_*`、`IMAGE_PARSE_SKIP_OCR_WHEN_VISION_OK`、`IMAGE_OCR_TIMEOUT_MS` 等说明。

### CI / 部署（腾讯云 CNB）

- **`.cnb.yml`**：`develop` / `main` 流水线、镜像构建与 VPS 部署脚本串联；Secret 导入、`allow_slugs`、SSH 与 Registry 登录方式文档化。
- **Docker / Compose**：后端监听 **`0.0.0.0`** 避免反代 502；可选 **`CNB_BACKEND_EXTRA_NETWORKS`**、主机端口映射避免冲突；**`FRONTEND_URL` / CORS** 与 nginx 上游 DNS defer 等部署修复。
- **GitHub Actions**：`deploy-vps` 仍以 workflow 形式保留（多为手动触发）；日常构建部署以 **CNB + `scripts/ci/`** 为主（见根目录 `.cnb.yml` 注释）。

### 安全与依赖

- Compose 示例与环境模板脱敏；npm 依赖漏洞项 bump（见提交 `security:` / `fix(ci):` 系列）。
- **仓库公开注意**：勿提交真实 `.env`、JWT、数据库口令、云密钥；仅用 `.env.example` 占位。

### 测试与脚本

- Playwright E2E：AI 分析流程覆盖「导出 XMind」按钮；部分环境需 **`playwright install-deps`**。
- 后端 **`pnpm run smoke:export-analysis-pdf`**：离线验证 PDF 服务嵌入 Mermaid 图路径。

---

## 2026-05-09

### 仓库整理

- 根目录环境模板合并为 **`docker-compose.full.env.example`**（删除 `.env.development.example`、`.env.production.example`）；补充 COS 与「仅起 DB」说明。
- 删除根目录重复且已失效的 **`test.sh`**、**`simple_test.sh`**（请用各包内 `pnpm test` / E2E）。
- 新增 **`docs/deployment/COMPOSE_FILES.md`**，说明各 Compose 文件职责；**`docker-compose.ghcr.yml`** 前端 `depends_on` 与 `full` 对齐为 `service_started`。

### 部署

- 后端：若 **`HOST` 为回环地址**，启动时改为监听 **`0.0.0.0`**，避免 Docker 内 Nginx 反代 **`502`**；**`VPS_DOCKER.md`** 增补 502 排查步骤。

## 2026-04-13

### API 响应

- 业务接口在发生校验失败、鉴权失败、资源不存在等情况时，**HTTP 状态码统一为 200**；语义错误在 JSON 的 **`code`** 字段（如 `400`、`401`、`404`、`409`、`429`、`500` 等），与成功响应的 **`code: 0`** 区分。
- 裸路由 **`GET /health`** 仍为纯文本 `ok`（200），不受上述包装影响，便于平台健康检查。
- 对 **`/api/auth/login`、`/api/auth/register`** 误用 `GET`/`HEAD` 时，返回 **HTTP 200**，报文内 **`code: 405`**。

### 注册与登录

- **登录**：使用 **用户名 + 密码**（不再使用邮箱登录）。
- **注册**：仍为 **邮箱 + 用户名 + 密码**；邮箱入库前统一 **小写**；用户名规则为字母、数字、下划线、中文、点、短横线（前后端校验一致）。
- **注册成功**响应中不再返回 `verificationToken`（避免泄露；需要发信时在服务端使用日志或接入邮件服务）。
- **忘记密码**：无论邮箱是否存在，返回统一说明，降低邮箱枚举风险；开发环境重置 token 仍在服务端日志中输出。
- **重置密码**：请求体仅需 **`token` + `newPassword`**，邮箱从令牌中解析，前端无需再传邮箱。

### 前端

- Axios 对 **HTTP 200 且 `code !== 0`** 的响应按业务错误处理（含登录/注册失败、限流、鉴权过期登出跳转等）。
- 登录页、注册页文案与表单校验与上述规则对齐。

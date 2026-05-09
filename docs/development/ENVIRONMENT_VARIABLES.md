# 环境变量说明

> **安全**：勿将 `.env`、Token、私钥、生产密码提交仓库或贴在工单/聊天中。

## 后端 `backend/.env`

以 `backend/.env.example` 为准；初始化：`cp backend/.env.example backend/.env` 后按需填写。

| 变量名 | 说明 |
|--------|------|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `JWT_SECRET` | JWT 签名密钥（足够长随机串） |
| `JWT_EXPIRES_IN` | JWT 过期时间，如 `7d` |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `DEFAULT_AI_MODEL` | AI 供应商与模型 |
| `UPLOAD_DIR` / `MAX_FILE_SIZE` | 上传目录与大小上限 |
| `CORS_ORIGINS` / `FRONTEND_URL` | 前端 Origin 与绝对地址（邮件/分享链接等） |
| `AUTH_ALLOW_PLAINTEXT_PASSWORD` | 应急明文密码救援，**默认留空**；用完即关 |

## 前端 `frontend/.env`

| 变量名 | 说明 |
|--------|------|
| `VITE_API_BASE_URL` | API 基址，须与 Nest `globalPrefix` 一致；开发可用 `/api`（Vite 代理）或 `http://localhost:3000/api` |
| `VITE_APP_NAME` | 应用名称 |

生产构建可参考 `frontend/.env.example`、`frontend/.env.production`（仅非敏感默认值）。

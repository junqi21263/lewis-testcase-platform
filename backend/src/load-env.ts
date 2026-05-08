/**
 * 在 AppModule 及其依赖读 process.env 之前注入 .env。
 * 尝试顺序：当前工作目录 .env、仓库根下 backend/.env、相对本文件解析的 backend/.env
 *（兼容在 monorepo 根目录或 backend 目录执行 `nest start` / `node dist/src/main`）。
 */
import * as fs from 'fs'
import * as path from 'path'
import { config } from 'dotenv'

const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
]

for (const file of candidates) {
  if (fs.existsSync(file)) {
    config({ path: file })
    break
  }
}

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- 已有账号保持可登录（新注册用户仍为 false，需邮件验证）
UPDATE "users" SET "emailVerified" = true;

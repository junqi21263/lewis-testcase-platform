-- 解析队列字段：用于后台 worker 认领、进度与卡死检测（不影响现有字段）
ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "parseStage" VARCHAR(64);
ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "parseAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "parseStartedAt" TIMESTAMP(3);
ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "parseFinishedAt" TIMESTAMP(3);
ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMP(3);


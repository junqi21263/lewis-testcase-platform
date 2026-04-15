-- 生成记录：归档/取消状态 + 软删除（回收站）
-- 若重复执行报错，可忽略「enum label already exists」
ALTER TYPE "GenerationStatus" ADD VALUE 'ARCHIVED';
ALTER TYPE "GenerationStatus" ADD VALUE 'CANCELLED';

ALTER TABLE "generation_records" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "generation_records_creatorId_deletedAt_idx" ON "generation_records"("creatorId", "deletedAt");

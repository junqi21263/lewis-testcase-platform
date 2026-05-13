-- Multimodal runtime config, usage ledger, cache, and batch task tables

DO $$
BEGIN
  CREATE TYPE "MultimodalModuleType" AS ENUM ('FILE_PARSE', 'AI_ANALYSIS', 'TESTCASE_GENERATION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "MultimodalFileKind" AS ENUM ('IMAGE', 'PDF', 'WORD', 'EXCEL', 'TEXT', 'YAML', 'JSON', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "BatchTaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "BatchTaskItemStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "system_runtime_configs" (
  "id" TEXT NOT NULL,
  "multimodalEnabled" BOOLEAN NOT NULL DEFAULT true,
  "multimodalDefaultModel" VARCHAR(100) NOT NULL DEFAULT 'hunyuan-vision',
  "textFallbackModel" VARCHAR(100) NOT NULL DEFAULT 'hunyuan-pro',
  "maxConcurrentTasks" INTEGER NOT NULL DEFAULT 3,
  "cacheTtlDays" INTEGER NOT NULL DEFAULT 7,
  "monthlyCostAlertCny" DOUBLE PRECISION NOT NULL DEFAULT 10,
  "autoDowngradeWhenOverBudget" BOOLEAN NOT NULL DEFAULT false,
  "multimodalInputPricePer1kCny" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "multimodalOutputPricePer1kCny" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "textInputPricePer1kCny" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "textOutputPricePer1kCny" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "system_runtime_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "multimodal_cache_entries" (
  "id" TEXT NOT NULL,
  "md5" VARCHAR(64) NOT NULL,
  "moduleType" "MultimodalModuleType" NOT NULL,
  "fileKind" "MultimodalFileKind" NOT NULL,
  "parseResult" TEXT,
  "analysisResult" TEXT,
  "testcaseResult" TEXT,
  "hitCount" INTEGER NOT NULL DEFAULT 0,
  "lastHitAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "multimodal_cache_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "batch_tasks" (
  "id" TEXT NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "moduleType" "MultimodalModuleType" NOT NULL,
  "status" "BatchTaskStatus" NOT NULL DEFAULT 'QUEUED',
  "totalCount" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failCount" INTEGER NOT NULL DEFAULT 0,
  "currentIndex" INTEGER NOT NULL DEFAULT 0,
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "cancelled" BOOLEAN NOT NULL DEFAULT false,
  "errorMessage" TEXT,
  "progressMeta" JSONB,
  "creatorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "batch_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "batch_task_items" (
  "id" TEXT NOT NULL,
  "batchTaskId" TEXT NOT NULL,
  "uploadedFileId" TEXT,
  "fileName" VARCHAR(255) NOT NULL,
  "fileKind" "MultimodalFileKind" NOT NULL,
  "seq" INTEGER NOT NULL,
  "status" "BatchTaskItemStatus" NOT NULL DEFAULT 'QUEUED',
  "resultRefId" VARCHAR(64),
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "batch_task_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "multimodal_usage_records" (
  "id" TEXT NOT NULL,
  "moduleType" "MultimodalModuleType" NOT NULL,
  "fileKind" "MultimodalFileKind" NOT NULL,
  "provider" VARCHAR(64),
  "modelName" VARCHAR(120),
  "uploadedFileId" TEXT,
  "recordId" TEXT,
  "batchTaskId" TEXT,
  "userId" TEXT NOT NULL,
  "requestChars" INTEGER NOT NULL DEFAULT 0,
  "promptTokens" INTEGER NOT NULL DEFAULT 0,
  "completionTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostCny" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cacheHit" BOOLEAN NOT NULL DEFAULT false,
  "latencyMs" INTEGER,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "errorMessage" TEXT,
  "extraMeta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "multimodal_usage_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "multimodal_cache_entries_md5_moduleType_key"
  ON "multimodal_cache_entries"("md5", "moduleType");
CREATE INDEX IF NOT EXISTS "multimodal_cache_entries_expiresAt_idx"
  ON "multimodal_cache_entries"("expiresAt");

CREATE INDEX IF NOT EXISTS "batch_tasks_creatorId_createdAt_idx"
  ON "batch_tasks"("creatorId", "createdAt");
CREATE INDEX IF NOT EXISTS "batch_tasks_status_updatedAt_idx"
  ON "batch_tasks"("status", "updatedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "batch_task_items_batchTaskId_seq_key"
  ON "batch_task_items"("batchTaskId", "seq");
CREATE INDEX IF NOT EXISTS "batch_task_items_status_updatedAt_idx"
  ON "batch_task_items"("status", "updatedAt");

CREATE INDEX IF NOT EXISTS "multimodal_usage_records_createdAt_idx"
  ON "multimodal_usage_records"("createdAt");
CREATE INDEX IF NOT EXISTS "multimodal_usage_records_moduleType_createdAt_idx"
  ON "multimodal_usage_records"("moduleType", "createdAt");
CREATE INDEX IF NOT EXISTS "multimodal_usage_records_userId_createdAt_idx"
  ON "multimodal_usage_records"("userId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "batch_tasks"
    ADD CONSTRAINT "batch_tasks_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "batch_task_items"
    ADD CONSTRAINT "batch_task_items_batchTaskId_fkey"
    FOREIGN KEY ("batchTaskId") REFERENCES "batch_tasks"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "batch_task_items"
    ADD CONSTRAINT "batch_task_items_uploadedFileId_fkey"
    FOREIGN KEY ("uploadedFileId") REFERENCES "uploaded_files"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "multimodal_usage_records"
    ADD CONSTRAINT "multimodal_usage_records_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "multimodal_usage_records"
    ADD CONSTRAINT "multimodal_usage_records_uploadedFileId_fkey"
    FOREIGN KEY ("uploadedFileId") REFERENCES "uploaded_files"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "multimodal_usage_records"
    ADD CONSTRAINT "multimodal_usage_records_recordId_fkey"
    FOREIGN KEY ("recordId") REFERENCES "generation_records"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "multimodal_usage_records"
    ADD CONSTRAINT "multimodal_usage_records_batchTaskId_fkey"
    FOREIGN KEY ("batchTaskId") REFERENCES "batch_tasks"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

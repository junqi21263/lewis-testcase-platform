-- 生成记录扩展：来源/参数快照/团队/需求副本/备注/软删标记、审计、分享、导出流水

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "GenerationSource" AS ENUM ('FILE_PARSE', 'MANUAL_INPUT', 'TEMPLATE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable generation_records
ALTER TABLE "generation_records" ADD COLUMN IF NOT EXISTS "demandContent" TEXT;
ALTER TABLE "generation_records" ADD COLUMN IF NOT EXISTS "generationSource" "GenerationSource";
ALTER TABLE "generation_records" ADD COLUMN IF NOT EXISTS "generateParams" JSONB;
ALTER TABLE "generation_records" ADD COLUMN IF NOT EXISTS "promptTemplateSnapshot" TEXT;
ALTER TABLE "generation_records" ADD COLUMN IF NOT EXISTS "remark" TEXT;
ALTER TABLE "generation_records" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "generation_records" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
ALTER TABLE "generation_records" ADD COLUMN IF NOT EXISTS "documentParseRecordId" TEXT;

UPDATE "generation_records" SET "demandContent" = "prompt" WHERE "demandContent" IS NULL;
UPDATE "generation_records" SET "generationSource" = CASE
  WHEN "templateId" IS NOT NULL THEN 'TEMPLATE'::"GenerationSource"
  WHEN "fileId" IS NOT NULL THEN 'FILE_PARSE'::"GenerationSource"
  ELSE 'MANUAL_INPUT'::"GenerationSource"
END
WHERE "generationSource" IS NULL;

ALTER TABLE "generation_records" ALTER COLUMN "generationSource" SET DEFAULT 'MANUAL_INPUT'::"GenerationSource";
ALTER TABLE "generation_records" ALTER COLUMN "generationSource" SET NOT NULL;
UPDATE "generation_records" SET "remark" = "notes" WHERE "remark" IS NULL AND "notes" IS NOT NULL;
UPDATE "generation_records" SET "isDeleted" = true WHERE "deletedAt" IS NOT NULL;

UPDATE "generation_records" gr
SET "teamId" = u."teamId"
FROM "users" u
WHERE gr."creatorId" = u."id" AND gr."teamId" IS NULL AND u."teamId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "generation_records_teamId_createdAt_idx" ON "generation_records"("teamId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "generation_records" ADD CONSTRAINT "generation_records_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "generation_records" ADD CONSTRAINT "generation_records_documentParseRecordId_fkey"
    FOREIGN KEY ("documentParseRecordId") REFERENCES "document_parse_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "generation_records_fulltext_idx" ON "generation_records"
  USING gin(to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("prompt", '') || ' ' || coalesce("notes", '') || ' ' || coalesce("remark", '')));

-- CreateTable generation_record_audit_logs
CREATE TABLE IF NOT EXISTS "generation_record_audit_logs" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "operatorId" TEXT NOT NULL,
  "action" VARCHAR(64) NOT NULL,
  "detail" JSONB,
  "ip" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generation_record_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "generation_record_audit_logs_recordId_createdAt_idx" ON "generation_record_audit_logs"("recordId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "generation_record_audit_logs" ADD CONSTRAINT "generation_record_audit_logs_recordId_fkey"
    FOREIGN KEY ("recordId") REFERENCES "generation_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "generation_record_audit_logs" ADD CONSTRAINT "generation_record_audit_logs_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable generation_record_shares
CREATE TABLE IF NOT EXISTS "generation_record_shares" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "sharerId" TEXT NOT NULL,
  "token" VARCHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "permission" JSONB NOT NULL DEFAULT '{}',
  "revoked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generation_record_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "generation_record_shares_token_key" ON "generation_record_shares"("token");
CREATE INDEX IF NOT EXISTS "generation_record_shares_recordId_idx" ON "generation_record_shares"("recordId");

DO $$ BEGIN
  ALTER TABLE "generation_record_shares" ADD CONSTRAINT "generation_record_shares_recordId_fkey"
    FOREIGN KEY ("recordId") REFERENCES "generation_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "generation_record_shares" ADD CONSTRAINT "generation_record_shares_sharerId_fkey"
    FOREIGN KEY ("sharerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable generation_record_exports
CREATE TABLE IF NOT EXISTS "generation_record_exports" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "suiteId" TEXT,
  "operatorId" TEXT NOT NULL,
  "format" "ExportFormat" NOT NULL,
  "fileSize" INTEGER,
  "downloadCount" INTEGER NOT NULL DEFAULT 1,
  "storagePath" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generation_record_exports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "generation_record_exports_recordId_createdAt_idx" ON "generation_record_exports"("recordId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "generation_record_exports" ADD CONSTRAINT "generation_record_exports_recordId_fkey"
    FOREIGN KEY ("recordId") REFERENCES "generation_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "generation_record_exports" ADD CONSTRAINT "generation_record_exports_suiteId_fkey"
    FOREIGN KEY ("suiteId") REFERENCES "test_suites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "generation_record_exports" ADD CONSTRAINT "generation_record_exports_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

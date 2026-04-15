-- 上传文件：解析错误、结构化需求列表
ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "parseError" TEXT;
ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "structuredRequirements" JSONB;

-- 文档解析快照（带入生成前落库）
CREATE TABLE IF NOT EXISTS "document_parse_records" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "teamId" TEXT,
    "title" VARCHAR(300) NOT NULL,
    "rawText" TEXT NOT NULL,
    "requirements" JSONB NOT NULL,
    "filledPrompt" TEXT NOT NULL,
    "templateId" TEXT,
    "fileIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_parse_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "document_parse_records_creatorId_createdAt_idx" ON "document_parse_records"("creatorId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "document_parse_records" ADD CONSTRAINT "document_parse_records_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "document_parse_records" ADD CONSTRAINT "document_parse_records_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "prompt_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

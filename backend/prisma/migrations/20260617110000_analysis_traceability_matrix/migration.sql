ALTER TABLE "test_cases"
ADD COLUMN IF NOT EXISTS "requirementIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "testPathIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "automationReadiness" JSONB;

ALTER TABLE "generation_records"
ADD COLUMN IF NOT EXISTS "analysisLatestVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "analysis_report_versions" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "markdown" TEXT NOT NULL,
  "structuredJson" JSONB NOT NULL,
  "modelId" VARCHAR(100),
  "modelName" VARCHAR(100),
  "sourceType" VARCHAR(32) NOT NULL DEFAULT 'analysis',
  "revisionNote" TEXT,
  "crossReviewStatus" VARCHAR(32) NOT NULL DEFAULT 'pending',
  "crossReviewJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analysis_report_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "analysis_report_versions_recordId_versionNumber_key"
ON "analysis_report_versions"("recordId", "versionNumber");

CREATE INDEX IF NOT EXISTS "analysis_report_versions_recordId_createdAt_idx"
ON "analysis_report_versions"("recordId", "createdAt");

ALTER TABLE "analysis_report_versions"
ADD CONSTRAINT "analysis_report_versions_recordId_fkey"
FOREIGN KEY ("recordId") REFERENCES "generation_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "requirement_coverage_items" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "reqId" VARCHAR(32) NOT NULL,
  "requirementText" TEXT NOT NULL,
  "coveredCaseIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "testPathIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "latestExecutionStatus" VARCHAR(32),
  "latestExecutionSummary" TEXT,
  "riskLevel" VARCHAR(32),
  "issues" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "requirement_coverage_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "requirement_coverage_items_recordId_reqId_key"
ON "requirement_coverage_items"("recordId", "reqId");

CREATE INDEX IF NOT EXISTS "requirement_coverage_items_recordId_idx"
ON "requirement_coverage_items"("recordId");

ALTER TABLE "requirement_coverage_items"
ADD CONSTRAINT "requirement_coverage_items_recordId_fkey"
FOREIGN KEY ("recordId") REFERENCES "generation_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

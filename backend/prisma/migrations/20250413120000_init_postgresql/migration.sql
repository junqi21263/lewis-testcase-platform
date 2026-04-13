-- Idempotent initial schema: safe to re-run after a partially applied / rolled-back migration
-- (e.g. enums exist but _prisma_migrations was cleared — avoids P3018 duplicate type/table)

-- CreateEnum (ignore if exists)
DO $do$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MEMBER', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE TYPE "FileType" AS ENUM ('PDF', 'WORD', 'EXCEL', 'YAML', 'IMAGE', 'TEXT');
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'PARSING', 'PARSED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE TYPE "TemplateCategory" AS ENUM ('FUNCTIONAL', 'PERFORMANCE', 'SECURITY', 'API', 'UI', 'CUSTOM');
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE TYPE "TestCaseStatus" AS ENUM ('DRAFT', 'REVIEWING', 'APPROVED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE TYPE "TestCasePriority" AS ENUM ('P0', 'P1', 'P2', 'P3');
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE TYPE "TestCaseType" AS ENUM ('FUNCTIONAL', 'PERFORMANCE', 'SECURITY', 'COMPATIBILITY', 'REGRESSION');
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE TYPE "ExportFormat" AS ENUM ('EXCEL', 'CSV', 'JSON', 'MARKDOWN', 'YAML');
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "teams" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "avatar" VARCHAR(500),
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "team_members" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "uploaded_files" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileType" "FileType" NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "parsedContent" TEXT,
    "uploaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "prompt_templates" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "category" "TemplateCategory" NOT NULL DEFAULT 'CUSTOM',
    "content" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "test_suites" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "projectName" VARCHAR(100),
    "status" "TestCaseStatus" NOT NULL DEFAULT 'DRAFT',
    "creatorId" TEXT NOT NULL,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "test_suites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "test_cases" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "precondition" TEXT,
    "steps" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "expectedResult" TEXT NOT NULL,
    "actualResult" TEXT,
    "priority" "TestCasePriority" NOT NULL DEFAULT 'P2',
    "type" "TestCaseType" NOT NULL DEFAULT 'FUNCTIONAL',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "TestCaseStatus" NOT NULL DEFAULT 'DRAFT',
    "suiteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "generation_records" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "sourceType" VARCHAR(20) NOT NULL,
    "prompt" TEXT NOT NULL,
    "modelId" VARCHAR(100) NOT NULL,
    "modelName" VARCHAR(100) NOT NULL,
    "caseCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "duration" INTEGER,
    "tokensUsed" INTEGER,
    "suiteId" TEXT,
    "fileId" TEXT,
    "templateId" TEXT,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "generation_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "download_records" (
    "id" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "fileSize" INTEGER,
    "downloadUrl" VARCHAR(500) NOT NULL,
    "downloaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "download_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ai_model_configs" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "modelId" VARCHAR(100) NOT NULL,
    "baseUrl" VARCHAR(500) NOT NULL,
    "apiKey" VARCHAR(500) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "maxTokens" INTEGER NOT NULL DEFAULT 4096,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_model_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "team_members_userId_teamId_key" ON "team_members"("userId", "teamId");

-- AddForeignKey (ignore if exists)
DO $do$ BEGIN
  ALTER TABLE "team_members" ADD CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  ALTER TABLE "test_suites" ADD CONSTRAINT "test_suites_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  ALTER TABLE "test_suites" ADD CONSTRAINT "test_suites_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "test_suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  ALTER TABLE "generation_records" ADD CONSTRAINT "generation_records_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  ALTER TABLE "generation_records" ADD CONSTRAINT "generation_records_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "test_suites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  ALTER TABLE "generation_records" ADD CONSTRAINT "generation_records_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "uploaded_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  ALTER TABLE "generation_records" ADD CONSTRAINT "generation_records_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "prompt_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  ALTER TABLE "download_records" ADD CONSTRAINT "download_records_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "test_suites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  ALTER TABLE "download_records" ADD CONSTRAINT "download_records_downloaderId_fkey" FOREIGN KEY ("downloaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

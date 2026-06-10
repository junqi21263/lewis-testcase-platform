-- CreateEnum
CREATE TYPE "CaseReviewStatus" AS ENUM ('draft', 'pending_review', 'approved', 'changes_requested', 'rejected');

-- CreateEnum
CREATE TYPE "RecordReviewStatus" AS ENUM ('pending_review', 'in_review', 'approved', 'changes_requested', 'rejected');

-- CreateEnum
CREATE TYPE "TestCaseVersionSource" AS ENUM ('generate', 'manual_edit', 'restore');

-- CreateEnum
CREATE TYPE "TestCaseCommentType" AS ENUM ('note', 'change_request');

-- AlterTable
ALTER TABLE "generation_records" ADD COLUMN "reviewStatus" "RecordReviewStatus" NOT NULL DEFAULT 'pending_review';

-- CreateTable
CREATE TABLE "test_case_reviews" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "reviewStatus" "CaseReviewStatus" NOT NULL DEFAULT 'pending_review',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "latestComment" TEXT,
    "currentVersionNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_case_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_case_versions" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "sourceType" "TestCaseVersionSource" NOT NULL,
    "changeSummary" VARCHAR(500),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_case_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_case_comments" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "versionId" TEXT,
    "commentType" "TestCaseCommentType" NOT NULL DEFAULT 'note',
    "content" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_case_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "test_case_reviews_caseId_key" ON "test_case_reviews"("caseId");

-- CreateIndex
CREATE INDEX "test_case_reviews_recordId_reviewStatus_idx" ON "test_case_reviews"("recordId", "reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "test_case_versions_caseId_versionNumber_key" ON "test_case_versions"("caseId", "versionNumber");

-- CreateIndex
CREATE INDEX "test_case_versions_recordId_createdAt_idx" ON "test_case_versions"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "test_case_comments_caseId_createdAt_idx" ON "test_case_comments"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "generation_records_reviewStatus_idx" ON "generation_records"("reviewStatus");

-- AddForeignKey
ALTER TABLE "test_case_reviews" ADD CONSTRAINT "test_case_reviews_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "generation_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_reviews" ADD CONSTRAINT "test_case_reviews_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_reviews" ADD CONSTRAINT "test_case_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_versions" ADD CONSTRAINT "test_case_versions_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "generation_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_versions" ADD CONSTRAINT "test_case_versions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_versions" ADD CONSTRAINT "test_case_versions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_comments" ADD CONSTRAINT "test_case_comments_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "generation_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_comments" ADD CONSTRAINT "test_case_comments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_comments" ADD CONSTRAINT "test_case_comments_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

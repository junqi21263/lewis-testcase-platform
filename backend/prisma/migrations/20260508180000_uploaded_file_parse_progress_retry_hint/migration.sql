-- Parse progress JSON + retry hint for PDF pipeline (phase 2/3 UX)
ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "parseProgress" JSONB;
ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "parseRetryHint" VARCHAR(32);

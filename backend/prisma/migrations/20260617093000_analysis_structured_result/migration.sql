ALTER TABLE "generation_records"
ADD COLUMN IF NOT EXISTS "analysisStructuredResult" JSONB;

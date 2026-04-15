-- 生成记录：自定义标签与备注
ALTER TABLE "generation_records" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "generation_records" ADD COLUMN IF NOT EXISTS "notes" TEXT;

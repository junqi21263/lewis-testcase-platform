-- Add COS storage fields for uploaded_files

-- 1) Enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FileStorageProvider') THEN
    CREATE TYPE "FileStorageProvider" AS ENUM ('LOCAL', 'COS');
  END IF;
END $$;

-- 2) Columns
ALTER TABLE "uploaded_files"
  ADD COLUMN IF NOT EXISTS "storageProvider" "FileStorageProvider" NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN IF NOT EXISTS "storageBucket" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "storageRegion" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "storageKey" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "storageUrl" VARCHAR(1000);


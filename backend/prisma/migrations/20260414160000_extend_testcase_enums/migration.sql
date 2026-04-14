-- Extend enums: TestCasePriority add P4; TestCaseType add API/UI/AUTOMATION
-- PostgreSQL: ADD VALUE is safe and preserves existing data.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'TestCasePriority' AND e.enumlabel = 'P4'
  ) THEN
    ALTER TYPE "TestCasePriority" ADD VALUE 'P4';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'TestCaseType' AND e.enumlabel = 'API'
  ) THEN
    ALTER TYPE "TestCaseType" ADD VALUE 'API';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'TestCaseType' AND e.enumlabel = 'UI'
  ) THEN
    ALTER TYPE "TestCaseType" ADD VALUE 'UI';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'TestCaseType' AND e.enumlabel = 'AUTOMATION'
  ) THEN
    ALTER TYPE "TestCaseType" ADD VALUE 'AUTOMATION';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


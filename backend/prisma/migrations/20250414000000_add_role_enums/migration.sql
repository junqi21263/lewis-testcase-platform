-- Idempotent bridge: older DBs had string roles; init migration may already define enums.
-- Fixes P3018 when UserRole already exists (e.g. partial apply or init ran first).

-- UserRole — must match init / schema (includes VIEWER)
DO $do$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MEMBER', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Ensure VIEWER exists on pre-existing 3-value enums (no IF NOT EXISTS on ADD VALUE in older PG)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'VIEWER'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'VIEWER';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Optional type (legacy); harmless if unused
DO $do$ BEGIN
  CREATE TYPE "TeamMemberRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MEMBER');
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- users.role -> UserRole when still varchar/text
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'users' AND c.column_name = 'role'
      AND (c.data_type = 'character varying' OR c.data_type = 'text')
  ) THEN
    ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
    ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole" USING (
      CASE trim("role"::text)
        WHEN 'SUPER_ADMIN' THEN 'SUPER_ADMIN'::"UserRole"
        WHEN 'ADMIN' THEN 'ADMIN'::"UserRole"
        WHEN 'VIEWER' THEN 'VIEWER'::"UserRole"
        ELSE 'MEMBER'::"UserRole"
      END
    );
    ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'MEMBER'::"UserRole";
  END IF;
END $$;

-- team_members.role: Prisma schema uses UserRole (not TeamMemberRole)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'team_members' AND c.column_name = 'role'
      AND (c.data_type = 'character varying' OR c.data_type = 'text')
  ) THEN
    ALTER TABLE "team_members" ALTER COLUMN "role" DROP DEFAULT;
    ALTER TABLE "team_members" ALTER COLUMN "role" TYPE "UserRole" USING (
      CASE trim("role"::text)
        WHEN 'SUPER_ADMIN' THEN 'SUPER_ADMIN'::"UserRole"
        WHEN 'ADMIN' THEN 'ADMIN'::"UserRole"
        WHEN 'VIEWER' THEN 'VIEWER'::"UserRole"
        ELSE 'MEMBER'::"UserRole"
      END
    );
    ALTER TABLE "team_members" ALTER COLUMN "role" SET DEFAULT 'MEMBER'::"UserRole";
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'team_members' AND c.column_name = 'role'
      AND c.udt_name = 'TeamMemberRole'
  ) THEN
    ALTER TABLE "team_members" ALTER COLUMN "role" DROP DEFAULT;
    ALTER TABLE "team_members" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::text::"UserRole");
    ALTER TABLE "team_members" ALTER COLUMN "role" SET DEFAULT 'MEMBER'::"UserRole";
  END IF;
END $$;

-- Ensure users.username is unique (production hardening).
-- 1) Fix existing duplicates by renaming all but the newest row per username.
-- 2) Add unique index.

-- 1) Deduplicate usernames (keep most recently updated as canonical).
WITH ranked AS (
  SELECT
    id,
    username,
    ROW_NUMBER() OVER (PARTITION BY username ORDER BY "updatedAt" DESC, "createdAt" DESC, id DESC) AS rn
  FROM "users"
)
UPDATE "users" u
SET
  "username" = u."username" || '_' || SUBSTRING(u."id" FROM 1 FOR 6),
  "updatedAt" = NOW()
FROM ranked r
WHERE u."id" = r.id AND r.rn > 1;

-- 2) Add unique index (idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");


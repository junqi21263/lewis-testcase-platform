-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "TeamMemberRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MEMBER');

-- AlterTable: users.role String -> UserRole enum
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole" USING (
  CASE "role"
    WHEN 'SUPER_ADMIN' THEN 'SUPER_ADMIN'::"UserRole"
    WHEN 'ADMIN'       THEN 'ADMIN'::"UserRole"
    ELSE                    'MEMBER'::"UserRole"
  END
);
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'MEMBER'::"UserRole";

-- AlterTable: team_members.role String -> TeamMemberRole enum
ALTER TABLE "team_members" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "team_members" ALTER COLUMN "role" TYPE "TeamMemberRole" USING (
  CASE "role"
    WHEN 'SUPER_ADMIN' THEN 'SUPER_ADMIN'::"TeamMemberRole"
    WHEN 'ADMIN'       THEN 'ADMIN'::"TeamMemberRole"
    ELSE                    'MEMBER'::"TeamMemberRole"
  END
);
ALTER TABLE "team_members" ALTER COLUMN "role" SET DEFAULT 'MEMBER'::"TeamMemberRole";

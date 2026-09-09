ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'Staff';

UPDATE "User"
SET "role" = 'Staff'
WHERE "role" NOT IN ('Admin', 'Staff') OR "role" IS NULL;

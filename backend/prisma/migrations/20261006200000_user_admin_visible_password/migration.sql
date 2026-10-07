-- Encrypted copy of the password a staff member last set, so an admin can look it up.
-- IF NOT EXISTS: some databases already have this column from earlier, out-of-repo work.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "temporary_password" TEXT;

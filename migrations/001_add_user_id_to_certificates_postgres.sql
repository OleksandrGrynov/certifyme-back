-- Migration: add user_id to certificates (Postgres)
-- 1) Add column if not exists
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS user_id bigint;

-- 2) Try to populate user_id by matching email (best-effort). Adjust matching logic as needed.
-- This will set user_id where certificates.user_email matches users.email and user_id is null
UPDATE certificates c
SET user_id = u.id
FROM users u
WHERE c.user_id IS NULL
  AND c.user_email IS NOT NULL
  AND u.email = c.user_email;

-- 3) If you can't match by email, you might try matching by name (less reliable)
-- Uncomment if you want to attempt name matching (first_name || ' ' || last_name = user_name)
-- UPDATE certificates c
-- SET user_id = u.id
-- FROM users u
-- WHERE c.user_id IS NULL
--   AND c.user_name IS NOT NULL
--   AND (u.first_name || ' ' || u.last_name) = c.user_name;

-- 4) Add index for performance
CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON certificates(user_id);

-- 5) Add foreign key constraint (optional, only if you're confident)
-- ALTER TABLE certificates ADD CONSTRAINT fk_certificates_user FOREIGN KEY (user_id) REFERENCES users(id);

-- Rollback notes:
-- To rollback: DROP INDEX IF EXISTS idx_certificates_user_id; ALTER TABLE certificates DROP COLUMN IF EXISTS user_id; -- and drop FK if created


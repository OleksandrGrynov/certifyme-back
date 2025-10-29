-- Migration: add user_id to certificates (MySQL)
-- 1) Add column if not exists
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS user_id BIGINT;

-- 2) Try to populate user_id by matching email (best-effort)
UPDATE certificates c
JOIN users u ON u.email = c.user_email
SET c.user_id = u.id
WHERE c.user_id IS NULL AND c.user_email IS NOT NULL;

-- 3) Add index
CREATE INDEX idx_certificates_user_id ON certificates(user_id);

-- 4) Add foreign key (optional)
-- ALTER TABLE certificates ADD CONSTRAINT fk_certificates_user FOREIGN KEY (user_id) REFERENCES users(id);

-- Rollback notes:
-- To rollback: DROP INDEX IF EXISTS idx_certificates_user_id ON certificates; ALTER TABLE certificates DROP COLUMN IF EXISTS user_id; -- and drop FK if created


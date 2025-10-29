-- Migration: add FOREIGN KEYs with ON DELETE CASCADE (Postgres)
-- Make sure user_id columns exist before adding FK constraints.

-- 1) Certificates.user_id
ALTER TABLE certificates
  ADD CONSTRAINT IF NOT EXISTS fk_certificates_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 2) user_achievements.user_id
ALTER TABLE user_achievements
  ADD CONSTRAINT IF NOT EXISTS fk_user_achievements_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Note: If constraints already exist or columns are missing, adjust accordingly.
-- Rollback (manual):
-- ALTER TABLE certificates DROP CONSTRAINT IF EXISTS fk_certificates_user;
-- ALTER TABLE user_achievements DROP CONSTRAINT IF EXISTS fk_user_achievements_user;


-- Migration: add FOREIGN KEYs with ON DELETE CASCADE (MySQL)
-- Make sure user_id columns exist before adding FK constraints.

ALTER TABLE certificates
  ADD CONSTRAINT fk_certificates_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE user_achievements
  ADD CONSTRAINT fk_user_achievements_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Rollback (manual):
-- ALTER TABLE certificates DROP FOREIGN KEY fk_certificates_user;
-- ALTER TABLE user_achievements DROP FOREIGN KEY fk_user_achievements_user;


-- 005_create_indexes.sql
-- Індекси для швидких агрегацій
CREATE INDEX IF NOT EXISTS idx_test_attempts_created_at ON test_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_test_attempts_test_id ON test_attempts(test_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_user_id ON test_attempts(user_id);

CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_certificates_issued ON certificates(issued);
CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON certificates(user_id);


-- 003_create_analytics_daily.sql
-- Таблиця для попередньо підрахованої щоденної аналітики
CREATE TABLE IF NOT EXISTS analytics_daily (
  date DATE PRIMARY KEY,
  registrations INT DEFAULT 0,
  tests INT DEFAULT 0,
  avg_score DOUBLE PRECISION DEFAULT 0,
  certificates INT DEFAULT 0,
  pass_rate DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON analytics_daily(date);


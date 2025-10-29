import cron from 'node-cron';
import { pool } from '../config/db.js';

async function computeDailyFor(date) {
  // date is a Date or date-string for which we compute metrics (usually yesterday)
  // We'll compute counts and upsert into analytics_daily
  const q = `
    INSERT INTO analytics_daily (date, registrations, tests, avg_score, certificates, pass_rate, created_at)
    SELECT
      $1::date AS date,
      COALESCE(u.registrations,0) AS registrations,
      COALESCE(t.tests,0) AS tests,
      COALESCE(t.avg_score,0) AS avg_score,
      COALESCE(c.certs,0) AS certificates,
      COALESCE(t.pass_rate,0) AS pass_rate,
      now()
    FROM
      (SELECT COUNT(*) AS registrations FROM users WHERE created_at::date = $1::date) u,
      (SELECT COUNT(*) AS tests, AVG(score) AS avg_score,
              CASE WHEN COUNT(*) = 0 THEN 0 ELSE SUM(CASE WHEN score >= COALESCE(pass_threshold,0) THEN 1 ELSE 0 END)::float / COUNT(*) END AS pass_rate
       FROM test_attempts WHERE created_at::date = $1::date) t,
      (SELECT COUNT(*) AS certs FROM certificates WHERE issued::date = $1::date) c
    ON CONFLICT (date) DO UPDATE SET registrations = EXCLUDED.registrations, tests = EXCLUDED.tests, avg_score = EXCLUDED.avg_score, certificates = EXCLUDED.certificates, pass_rate = EXCLUDED.pass_rate, created_at = EXCLUDED.created_at;
  `;

  await pool.query(q, [date]);
}

// schedule daily at 00:05 server time
cron.schedule('5 0 * * *', async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0,10);
  console.log('analyticsCron running for', dateStr);
  try {
    await computeDailyFor(dateStr);
    console.log('analyticsCron finished for', dateStr);
  } catch (e) {
    console.error('analyticsCron error', e);
  }
});

// Allow running the job manually
export async function runOnce(dateStr) {
  await computeDailyFor(dateStr);
}


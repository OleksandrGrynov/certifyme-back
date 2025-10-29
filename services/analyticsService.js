import { pool } from '../config/db.js';

let redis = null;
let redisInitialized = false;
async function ensureRedis() {
  if (redisInitialized) return;
  redisInitialized = true;
  if (!process.env.REDIS_URL) return;
  try {
    const RedisMod = await import('ioredis');
    redis = new RedisMod.default(process.env.REDIS_URL);
  } catch (e) {
    console.error('redis init error', e && e.message);
    redis = null;
  }
}

const OVERVIEW_KEY = 'analytics:overview';
const DAILY_KEY = (days) => `analytics:daily:${days}`;

export async function getOverview() {
  // try cache
  await ensureRedis();
  if (redis) {
    try {
      const cached = await redis.get(OVERVIEW_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.error('redis read error', e.message);
    }
  }

  // light realtime aggregation
  const queries = [
    pool.query('SELECT COUNT(*)::int AS total_users FROM users'),
    pool.query("SELECT COUNT(DISTINCT user_id)::int AS active_last_7d FROM test_attempts WHERE created_at >= now() - interval '7 days'"),
    pool.query("SELECT COUNT(*)::int AS registrations_this_week FROM users WHERE created_at >= date_trunc('week', now())"),
    pool.query("SELECT COUNT(*)::int AS tests_taken FROM test_attempts"),
    pool.query("SELECT AVG(score)::numeric(10,2) AS avg_score FROM test_attempts WHERE score IS NOT NULL"),
    pool.query("SELECT COUNT(*)::int AS certificates_issued FROM certificates"),
    pool.query("SELECT CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(CASE WHEN score >= COALESCE(pass_threshold,0) THEN 1 ELSE 0 END)::float/COUNT(*) END AS pass_rate FROM test_attempts")
  ];

  const [totalRes, activeRes, regsRes, testsRes, avgRes, certsRes, passRes] = await Promise.all(queries);

  const data = {
    total_users: Number(totalRes.rows[0].total_users || 0),
    active_last_7d: Number(activeRes.rows[0].active_last_7d || 0),
    registrations_this_week: Number(regsRes.rows[0].registrations_this_week || 0),
    tests_taken: Number(testsRes.rows[0].tests_taken || 0),
    avg_score: Number(avgRes.rows[0].avg_score || 0),
    certificates_issued: Number(certsRes.rows[0].certificates_issued || 0),
    pass_rate: Number(passRes.rows[0].pass_rate || 0),
    last_updated: new Date().toISOString()
  };

  try {
    await redis.set(OVERVIEW_KEY, JSON.stringify(data), 'EX', 120); // cache 2 min
  } catch (e) {
    console.error('redis set error', e.message);
  }

  return data;
}

export async function getDaily(days = 30) {
  // try cache
  const key = DAILY_KEY(days);
  await ensureRedis();
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached);
    } catch (e) { console.error('redis read error', e.message); }
  }

  // first try precomputed analytics_daily
  const dailyRows = await pool.query(
    `SELECT date, registrations, tests, avg_score, certificates, pass_rate FROM analytics_daily
     WHERE date >= (current_date - $1::int + 1)
     ORDER BY date`,
    [days]
  );

  if (dailyRows.rows.length > 0) {
    const registrations = dailyRows.rows.map(r => ({ date: r.date.toISOString().slice(0,10), count: Number(r.registrations) }));
    const tests = dailyRows.rows.map(r => ({ date: r.date.toISOString().slice(0,10), count: Number(r.tests) }));
    const avg_score = dailyRows.rows.map(r => ({ date: r.date.toISOString().slice(0,10), value: Number(r.avg_score) }));
    const result = { registrations, tests, avg_score };
    if (redis) {
      try { await redis.set(key, JSON.stringify(result), 'EX', 300); } catch (e) { console.error('redis set error', e.message); }
    }
    return result;
  }

  // fallback: compute from raw tables
  const registrationsQ = await pool.query(
    `SELECT date_trunc('day', created_at)::date AS date, COUNT(*)::int AS count
     FROM users WHERE created_at >= now() - ($1::int * interval '1 day')
     GROUP BY date ORDER BY date`, [days]
  );

  const testsQ = await pool.query(
    `SELECT date_trunc('day', created_at)::date AS date, COUNT(*)::int AS count
     FROM test_attempts WHERE created_at >= now() - ($1::int * interval '1 day')
     GROUP BY date ORDER BY date`, [days]
  );

  const avgQ = await pool.query(
    `SELECT date_trunc('day', created_at)::date AS date, AVG(score)::numeric(10,2) AS avg
     FROM test_attempts WHERE created_at >= now() - ($1::int * interval '1 day')
     GROUP BY date ORDER BY date`, [days]
  );

  const registrations = registrationsQ.rows.map(r => ({ date: r.date.toISOString().slice(0,10), count: Number(r.count) }));
  const tests = testsQ.rows.map(r => ({ date: r.date.toISOString().slice(0,10), count: Number(r.count) }));
  const avg_score = avgQ.rows.map(r => ({ date: r.date.toISOString().slice(0,10), value: Number(r.avg) }));

  const result = { registrations, tests, avg_score };
  if (redis) {
    try { await redis.set(key, JSON.stringify(result), 'EX', 300); } catch (e) { console.error('redis set error', e.message); }
  }
  return result;
}

export async function getTopCourses(limit = 10) {
  const q = `
    SELECT t.id, COALESCE(t.title_ua,t.title_en) AS title, COUNT(a.id) AS tests_taken, AVG(a.score)::numeric(10,2) AS avg_score
    FROM tests t
    LEFT JOIN test_attempts a ON a.test_id = t.id
    GROUP BY t.id, title
    ORDER BY tests_taken DESC
    LIMIT $1
  `;
  const rows = await pool.query(q, [limit]);
  return rows.rows;
}

export async function getRecent(limit = 50, page = 1) {
  const offset = (page - 1) * limit;
  const q = `SELECT id, user_id, type, description, meta, created_at FROM events ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
  const rows = await pool.query(q, [limit, offset]);
  return { items: rows.rows, page, limit };
}

export async function getUserMetrics({ from = null, to = null, page = 1, limit = 50 }) {
  const offset = (page - 1) * limit;
  // Простий приклад: повернути список користувачів з кількістю тестів та середнім балом
  const q = `
    SELECT u.id, u.email, u.first_name, u.last_name, u.created_at,
           COALESCE(a.tests_count,0) AS tests_count,
           COALESCE(a.avg_score,0) AS avg_score
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS tests_count, AVG(score) AS avg_score
      FROM test_attempts
      GROUP BY user_id
    ) a ON a.user_id = u.id
    ORDER BY u.created_at DESC
    LIMIT $1 OFFSET $2
  `;
  const rows = await pool.query(q, [limit, offset]);
  return { items: rows.rows, page, limit };
}

export async function getTestResults(testId, { from = null, to = null }) {
  const params = [testId];
  let dateFilter = '';
  if (from) { params.push(from); dateFilter += ` AND created_at >= $${params.length}`; }
  if (to) { params.push(to); dateFilter += ` AND created_at <= $${params.length}`; }

  const q = `
    SELECT COUNT(*)::int AS attempts, AVG(score)::numeric(10,2) AS avg_score,
      SUM(CASE WHEN score >= COALESCE(pass_threshold,0) THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*),0) AS pass_rate
    FROM test_attempts
    WHERE test_id = $1 ${dateFilter}
  `;
  const rows = await pool.query(q, params);
  return rows.rows[0];
}

export async function getUserOverview(userId) {
  // per-user quick metrics
  const [coursesRes, testsRes, avgRes, certsRes, passRes, streakRes] = await Promise.all([
    // distinct courses/tests user interacted with
    pool.query("SELECT COUNT(DISTINCT test_id)::int AS courses_enrolled FROM test_attempts WHERE user_id = $1", [userId]),
    pool.query("SELECT COUNT(*)::int AS my_tests_taken FROM test_attempts WHERE user_id = $1", [userId]),
    pool.query("SELECT AVG(score)::numeric(10,2) AS my_avg_score FROM test_attempts WHERE user_id = $1 AND score IS NOT NULL", [userId]),
    pool.query("SELECT COUNT(*)::int AS my_certificates FROM certificates WHERE user_id = $1", [userId]),
    pool.query("SELECT CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(CASE WHEN score >= COALESCE(pass_threshold,0) THEN 1 ELSE 0 END)::float/COUNT(*) END AS my_pass_rate FROM test_attempts WHERE user_id = $1", [userId]),
    // simple activity days in last 30 days
    pool.query("SELECT COUNT(DISTINCT date_trunc('day', created_at))::int AS recent_active_days FROM test_attempts WHERE user_id = $1 AND created_at >= now() - interval '30 days'", [userId]),
  ]);

  return {
    user_id: userId,
    courses_enrolled: Number(coursesRes.rows[0]?.courses_enrolled || 0),
    my_tests_taken: Number(testsRes.rows[0]?.my_tests_taken || 0),
    my_avg_score: Number(avgRes.rows[0]?.my_avg_score || 0),
    my_certificates: Number(certsRes.rows[0]?.my_certificates || 0),
    my_pass_rate: Number(passRes.rows[0]?.my_pass_rate || 0),
    current_streak_days: Number(streakRes.rows[0]?.recent_active_days || 0),
    last_updated: new Date().toISOString(),
  };
}

export async function getUserDaily(userId, days = 30) {
  const registrations = [];
  // activity: combined actions per day (test attempts + certificates)
  const activityQ = await pool.query(
    `SELECT date_trunc('day', created_at)::date AS date, COUNT(*)::int AS count
     FROM (
       SELECT created_at FROM test_attempts WHERE user_id = $1
       UNION ALL
       SELECT issued AS created_at FROM certificates WHERE user_id = $1
     ) s
     WHERE created_at >= now() - ($2::int * interval '1 day')
     GROUP BY date ORDER BY date`,
    [userId, days]
  );

  const testsQ = await pool.query(
    `SELECT date_trunc('day', created_at)::date AS date, COUNT(*)::int AS count
     FROM test_attempts WHERE user_id = $1 AND created_at >= now() - ($2::int * interval '1 day')
     GROUP BY date ORDER BY date`,
    [userId, days]
  );

  const activity = activityQ.rows.map(r => ({ date: r.date.toISOString().slice(0,10), count: Number(r.count) }));
  const tests = testsQ.rows.map(r => ({ date: r.date.toISOString().slice(0,10), count: Number(r.count) }));

  return { activity, tests };
}

export async function getUserTopCourses(userId, limit = 10) {
  const q = `
    SELECT t.id, COALESCE(t.title_ua,t.title_en) AS name, COUNT(a.id)::int AS tests_taken, AVG(a.score)::numeric(10,2) AS avg_score
    FROM tests t
    JOIN test_attempts a ON a.test_id = t.id
    WHERE a.user_id = $1
    GROUP BY t.id, name
    ORDER BY tests_taken DESC
    LIMIT $2
  `;
  const rows = await pool.query(q, [userId, limit]);
  return rows.rows.map(r => ({ name: r.name, tests_taken: Number(r.tests_taken), avg_score: Number(r.avg_score || 0) }));
}

export async function getUserRecent(userId, limit = 50, page = 1) {
  const offset = (page - 1) * limit;
  // combine events + certificates + test_attempts summaries
  const q = `
    SELECT created_at, type, description FROM (
      SELECT created_at, 'test_attempt'::text AS type, ('Test attempt: ' || COALESCE(score::text,'')) AS description FROM test_attempts WHERE user_id = $1
      UNION ALL
      SELECT issued AS created_at, 'certificate'::text AS type, ('Certificate: ' || cert_id || ' / ' || COALESCE(course,'')) AS description FROM certificates WHERE user_id = $1
      UNION ALL
      SELECT created_at, type, description FROM events WHERE user_id = $1
    ) s
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;
  const rows = await pool.query(q, [userId, limit, offset]);
  return { items: rows.rows, page: page, limit };
}

// services/analyticsService.js
import prisma from "../config/prisma.js";

// ───────────────────────────────────────────────────────────────
// Optional Redis (same behavior as before; safe if not configured)
// ───────────────────────────────────────────────────────────────
let redis = null;
let redisReady = false;
async function ensureRedis() {
  if (redisReady) return;
  redisReady = true;
  const url = process.env.REDIS_URL;
  if (!url) return;
  try {
    const { default: IORedis } = await import("ioredis");
    redis = new IORedis(url);
  } catch (e) {
    console.error("redis init error:", e?.message || e);
    redis = null;
  }
}
async function cacheGet(key) {
  await ensureRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("redis get error:", e?.message || e);
    return null;
  }
}
async function cacheSet(key, value, ttlSec) {
  await ensureRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSec);
  } catch (e) {
    console.error("redis set error:", e?.message || e);
  }
}

// ───────────────────────────────────────────────────────────────
// GLOBAL OVERVIEW (matches prior SQL logic)
// ───────────────────────────────────────────────────────────────
const OVERVIEW_KEY = "analytics:overview";

export async function getOverview() {
  const cached = await cacheGet(OVERVIEW_KEY);
  if (cached) return cached;

  // users total
  const usersCountP = prisma.user.count();

  // active last 7 days (distinct users with attempts)
  const activeLast7dP = prisma.$queryRaw`
    SELECT COUNT(DISTINCT "user_id")::int AS cnt
    FROM "test_attempts"
    WHERE "created_at" >= NOW() - INTERVAL '7 days'
  `;

  // registrations this week
  const regsThisWeekP = prisma.$queryRaw`
    SELECT COUNT(*)::int AS cnt
    FROM "users"
    WHERE "created_at" >= date_trunc('week', NOW())
  `;

  // tests taken total
  const testsTakenP = prisma.testAttempt.count();

  // avg score (non-null)
  const avgScoreAggP = prisma.testAttempt.aggregate({
    _avg: { score: true },
    where: { score: { not: null } },
  });

  // certificates issued
  const certsCountP = prisma.certificate.count();

  // pass rate = passed/total (score >= pass_threshold), computed in SQL to avoid client filtering
  const passRateP = prisma.$queryRaw`
    SELECT CASE WHEN COUNT(*)=0 THEN 0
                ELSE SUM(CASE WHEN "score" >= COALESCE("pass_threshold",0) THEN 1 ELSE 0 END)::float / COUNT(*)
           END AS pass_rate
    FROM "test_attempts"
    WHERE "score" IS NOT NULL
  `;

  const [
    usersCount,
    activeLast7d,
    regsThisWeek,
    testsTaken,
    avgScoreAgg,
    certsCount,
    passRateRow,
  ] = await Promise.all([
    usersCountP,
    activeLast7dP,
    regsThisWeekP,
    testsTakenP,
    avgScoreAggP,
    certsCountP,
    passRateP,
  ]);

  const data = {
    total_users: usersCount || 0,
    active_last_7d: Number(activeLast7d?.[0]?.cnt || 0),
    registrations_this_week: Number(regsThisWeek?.[0]?.cnt || 0),
    tests_taken: testsTaken || 0,
    avg_score: Number((avgScoreAgg._avg.score ?? 0).toFixed(2)),
    certificates_issued: certsCount || 0,
    pass_rate: Number(passRateRow?.[0]?.pass_rate || 0),
    last_updated: new Date().toISOString(),
  };

  await cacheSet(OVERVIEW_KEY, data, 120); // 2 minutes
  return data;
}

// ───────────────────────────────────────────────────────────────
// GLOBAL DAILY (precomputed analytics_daily with fallback)
// ───────────────────────────────────────────────────────────────
const DAILY_KEY = (days) => `analytics:daily:${days}`;

export async function getDaily(days = 30) {
  const key = DAILY_KEY(days);
  const cached = await cacheGet(key);
  if (cached) return cached;

  // Try precomputed AnalyticsDaily first
  const since = new Date();
  since.setDate(since.getDate() - Number(days));

  const dailyRows = await prisma.analyticsDaily.findMany({
    where: { date: { gte: since } },
    orderBy: { date: "asc" },
    select: { date: true, registrations: true, tests: true, avgScore: true },
  });

  if (dailyRows.length > 0) {
    const registrations = dailyRows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      count: Number(r.registrations || 0),
    }));
    const tests = dailyRows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      count: Number(r.tests || 0),
    }));
    const avg_score = dailyRows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      value: Number(r.avgScore || 0),
    }));
    const result = { registrations, tests, avg_score };
    await cacheSet(key, result, 300);
    return result;
  }

  // Fallback: compute from raw tables (SQL for efficiency)
  const regsQ = prisma.$queryRaw`
    SELECT date_trunc('day',"created_at")::date AS d, COUNT(*)::int AS c
    FROM "users"
    WHERE "created_at" >= NOW() - (${days}::int * INTERVAL '1 day')
    GROUP BY d ORDER BY d
  `;
  const testsQ = prisma.$queryRaw`
    SELECT date_trunc('day',"created_at")::date AS d, COUNT(*)::int AS c
    FROM "test_attempts"
    WHERE "created_at" >= NOW() - (${days}::int * INTERVAL '1 day')
    GROUP BY d ORDER BY d
  `;
  const avgQ = prisma.$queryRaw`
    SELECT date_trunc('day',"created_at")::date AS d, AVG("score")::numeric(10,2) AS a
    FROM "test_attempts"
    WHERE "created_at" >= NOW() - (${days}::int * INTERVAL '1 day') AND "score" IS NOT NULL
    GROUP BY d ORDER BY d
  `;

  const [regsRows, testsRows, avgRows] = await Promise.all([regsQ, testsQ, avgQ]);

  const registrations = regsRows.map((r) => ({
    date: new Date(r.d).toISOString().slice(0, 10),
    count: Number(r.c || 0),
  }));
  const tests = testsRows.map((r) => ({
    date: new Date(r.d).toISOString().slice(0, 10),
    count: Number(r.c || 0),
  }));
  const avg_score = avgRows.map((r) => ({
    date: new Date(r.d).toISOString().slice(0, 10),
    value: Number(r.a || 0),
  }));

  const result = { registrations, tests, avg_score };
  await cacheSet(key, result, 300);
  return result;
}

// ───────────────────────────────────────────────────────────────
// GLOBAL TOP COURSES (by attempts), with titles
// ───────────────────────────────────────────────────────────────
export async function getTopCourses(limit = 10) {
  // group attempts by testId
  const grouped = await prisma.testAttempt.groupBy({
    by: ["testId"],
    _count: { testId: true },
    _avg: { score: true },
    orderBy: { _count: { testId: "desc" } },
    take: Math.max(1, Math.min(Number(limit) || 10, 50)),
  });

  if (grouped.length === 0) return [];

  const testIds = grouped.map((g) => g.testId);
  const tests = await prisma.test.findMany({
    where: { id: { in: testIds } },
    select: { id: true, titleUa: true, titleEn: true },
  });
  const titleById = new Map(tests.map((t) => [t.id, t.titleUa || t.titleEn || `Test #${t.id}`]));

  return grouped.map((g) => ({
    id: g.testId,
    title: titleById.get(g.testId) || `Test #${g.testId}`,
    tests_taken: g._count.testId || 0,
    avg_score: Number((g._avg.score ?? 0).toFixed(2)),
  }));
}

// ───────────────────────────────────────────────────────────────
// GLOBAL RECENT EVENTS (admin feed style)
// ───────────────────────────────────────────────────────────────
export async function getRecent(limit = 50, page = 1) {
  const take = Math.max(1, Math.min(Number(limit) || 50, 200));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    take,
    skip,
    select: { id: true, userId: true, type: true, description: true, meta: true, createdAt: true },
  });

  return {
    items: events.map((e) => ({
      id: e.id.toString(),
      user_id: e.userId ? Number(e.userId) : null,
      type: e.type,
      description: e.description || "",
      meta: e.meta || null,
      created_at: e.createdAt,
    })),
    page: Number(page) || 1,
    limit: take,
  };
}

// ───────────────────────────────────────────────────────────────
// GLOBAL USER METRICS LIST (paginated dashboard table)
// ───────────────────────────────────────────────────────────────
export async function getUserMetrics({ page = 1, limit = 50 } = {}) {
  const take = Math.max(1, Math.min(Number(limit) || 50, 200));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  // pull users page
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take,
    skip,
    select: { id: true, email: true, firstName: true, lastName: true, createdAt: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return { items: [], page: Number(page) || 1, limit: take };

  // aggregate attempts per user
  const attemptsAgg = await prisma.testAttempt.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds } },
    _count: { _all: true },
    _avg: { score: true },
  });
  const attemptsMap = new Map(attemptsAgg.map((a) => [a.userId, a]));

  const items = users.map((u) => {
    const agg = attemptsMap.get(u.id);
    return {
      id: u.id,
      email: u.email,
      first_name: u.firstName,
      last_name: u.lastName,
      created_at: u.createdAt,
      tests_count: Number(agg?._count?._all || 0),
      avg_score: Number((agg?._avg?.score ?? 0).toFixed(2)),
    };
  });

  return { items, page: Number(page) || 1, limit: take };
}

// ───────────────────────────────────────────────────────────────
// GLOBAL TEST RESULTS SUMMARY (attempts / avg_score / pass_rate)
// ───────────────────────────────────────────────────────────────
export async function getTestResults(testId, { from = null, to = null } = {}) {
  const tid = Number(testId);
  if (!tid) return { attempts: 0, avg_score: 0, pass_rate: 0 };

  // Date bounds for raw SQL
  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS attempts,
      AVG("score")::numeric(10,2) AS avg_score,
      CASE WHEN COUNT(*)=0 THEN 0
           ELSE SUM(CASE WHEN "score" >= COALESCE("pass_threshold",0) THEN 1 ELSE 0 END)::float / COUNT(*)
      END AS pass_rate
    FROM "test_attempts"
    WHERE "test_id" = ${tid}
      AND (${from ? prisma.$queryRaw`"created_at" >= ${from}` : prisma.$queryRaw`1=1`})
      AND (${to ? prisma.$queryRaw`"created_at" <= ${to}` : prisma.$queryRaw`1=1`})
  `;

  const r = rows?.[0] || {};
  return {
    attempts: Number(r.attempts || 0),
    avg_score: Number(r.avg_score || 0),
    pass_rate: Number(r.pass_rate || 0),
  };
}

// ───────────────────────────────────────────────────────────────
// PER-USER OVERVIEW (matches your previous userOverview logic)
// ───────────────────────────────────────────────────────────────
export async function getUserOverview(userId) {
  const uid = Number(userId);

  const [coursesRes, testsRes, avgRes, certsRes, passRes, streakRes] = await Promise.all([
    prisma.testAttempt.groupBy({
      by: ["userId", "testId"],
      where: { userId: uid },
      _count: { testId: true },
    }).then((rows) => rows.length), // distinct tests interacted
    prisma.testAttempt.count({ where: { userId: uid } }),
    prisma.testAttempt.aggregate({ where: { userId: uid, score: { not: null } }, _avg: { score: true } }),
    prisma.certificate.count({ where: { userId: uid } }),
    prisma.$queryRaw`
      SELECT CASE WHEN COUNT(*)=0 THEN 0
                  ELSE SUM(CASE WHEN "score" >= COALESCE("pass_threshold",0) THEN 1 ELSE 0 END)::float / COUNT(*)
             END AS pass_rate
      FROM "test_attempts"
      WHERE "user_id" = ${uid} AND "score" IS NOT NULL
    `,
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS days
      FROM (
        SELECT DISTINCT date_trunc('day',"created_at")::date AS d
        FROM "test_attempts"
        WHERE "user_id" = ${uid} AND "created_at" >= NOW() - INTERVAL '30 days'
      ) s
    `,
  ]);

  return {
    user_id: uid,
    courses_enrolled: Number(coursesRes || 0),
    my_tests_taken: Number(testsRes || 0),
    my_avg_score: Number((avgRes._avg.score ?? 0).toFixed(2)),
    my_certificates: Number(certsRes || 0),
    my_pass_rate: Number(passRes?.[0]?.pass_rate || 0),
    current_streak_days: Number(streakRes?.[0]?.days || 0),
    last_updated: new Date().toISOString(),
  };
}

// ───────────────────────────────────────────────────────────────
// PER-USER DAILY ACTIVITY (attempts + certificates union)
// ───────────────────────────────────────────────────────────────
export async function getUserDaily(userId, days = 30) {
  const uid = Number(userId);

  const activityQ = prisma.$queryRaw`
    SELECT date_trunc('day', s.created_at)::date AS d, COUNT(*)::int AS c
    FROM (
      SELECT "created_at" FROM "test_attempts" WHERE "user_id" = ${uid}
      UNION ALL
      SELECT "issued" AS "created_at" FROM "certificates" WHERE "user_id" = ${uid}
    ) s
    WHERE s.created_at >= NOW() - (${days}::int * INTERVAL '1 day')
    GROUP BY d ORDER BY d
  `;

  const testsQ = prisma.$queryRaw`
    SELECT date_trunc('day',"created_at")::date AS d, COUNT(*)::int AS c
    FROM "test_attempts"
    WHERE "user_id" = ${uid} AND "created_at" >= NOW() - (${days}::int * INTERVAL '1 day')
    GROUP BY d ORDER BY d
  `;

  const [activityRows, testRows] = await Promise.all([activityQ, testsQ]);

  const activity = activityRows.map((r) => ({
    date: new Date(r.d).toISOString().slice(0, 10),
    count: Number(r.c || 0),
  }));
  const tests = testRows.map((r) => ({
    date: new Date(r.d).toISOString().slice(0, 10),
    count: Number(r.c || 0),
  }));

  return { activity, tests };
}

// ───────────────────────────────────────────────────────────────
// PER-USER TOP COURSES (by attempts), with titles
// ───────────────────────────────────────────────────────────────
export async function getUserTopCourses(userId, limit = 10) {
  const uid = Number(userId);
  const grouped = await prisma.testAttempt.groupBy({
    by: ["testId"],
    where: { userId: uid },
    _count: { testId: true },
    _avg: { score: true },
    orderBy: { _count: { testId: "desc" } },
    take: Math.max(1, Math.min(Number(limit) || 10, 50)),
  });

  if (grouped.length === 0) return [];

  const testIds = grouped.map((g) => g.testId);
  const tests = await prisma.test.findMany({
    where: { id: { in: testIds } },
    select: { id: true, titleUa: true, titleEn: true },
  });
  const titleById = new Map(tests.map((t) => [t.id, t.titleUa || t.titleEn || `Test #${t.id}`]));

  return grouped.map((g) => ({
    name: titleById.get(g.testId) || `Test #${g.testId}`,
    tests_taken: g._count.testId || 0,
    avg_score: Number((g._avg.score ?? 0).toFixed(2)),
  }));
}

// ───────────────────────────────────────────────────────────────
// PER-USER RECENT (combine attempts + certificates + events)
// ───────────────────────────────────────────────────────────────
export async function getUserRecent(userId, limit = 50, page = 1) {
  const uid = Number(userId);
  const take = Math.max(1, Math.min(Number(limit) || 50, 200));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  // Use raw union for performance and correct ordering
  const rows = await prisma.$queryRaw`
    SELECT created_at, type, description FROM (
      SELECT "created_at", 'test_attempt'::text AS type,
             ('Test attempt: ' || COALESCE("score"::text,'')) AS description
      FROM "test_attempts"
      WHERE "user_id" = ${uid}

      UNION ALL

      SELECT "issued" AS created_at, 'certificate'::text AS type,
             ('Certificate: ' || "cert_id" || ' / ' || COALESCE("course",'')) AS description
      FROM "certificates"
      WHERE "user_id" = ${uid}

      UNION ALL

      SELECT "created_at", "type", COALESCE("description",'') AS description
      FROM "events"
      WHERE "user_id" = ${BigInt(uid)}
    ) s
    ORDER BY created_at DESC
    LIMIT ${take} OFFSET ${skip}
  `;

  return {
    items: rows.map((r) => ({
      created_at: r.created_at,
      type: r.type,
      description: r.description,
    })),
    page: Number(page) || 1,
    limit: take,
  };
}

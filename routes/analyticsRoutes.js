import express from "express";
import { pool } from "../config/db.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/user/overview", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        const [courses, tests, avg, certs, passRate, streak] = await Promise.all([
            pool.query("SELECT COUNT(DISTINCT test_id) FROM certificates WHERE user_id = $1", [userId]),
            pool.query("SELECT COUNT(*) FROM certificates WHERE user_id = $1", [userId]),
            pool.query("SELECT AVG(percent) FROM certificates WHERE user_id = $1", [userId]),
            pool.query("SELECT COUNT(*) FROM certificates WHERE user_id = $1", [userId]),
            pool.query("SELECT AVG(CASE WHEN percent >= 60 THEN 1 ELSE 0 END)::float FROM certificates WHERE user_id = $1", [userId]),
            pool.query(`
          SELECT COUNT(*) AS streak
          FROM (
              SELECT DISTINCT DATE(created_at)
              FROM certificates
              WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
          ) d
      `, [userId]),
        ]);

        res.json({
            success: true,
            data: {
                user_id: userId,
                courses_enrolled: Number(courses.rows[0].count),
                my_tests_taken: Number(tests.rows[0].count),
                my_avg_score: Math.round(avg.rows[0].avg || 0),
                my_certificates: Number(certs.rows[0].count),
                my_pass_rate: Number(passRate.rows[0].avg || 0),
                current_streak_days: Number(streak.rows[0].streak || 0),
                last_updated: new Date(),
            },
        });
    } catch (err) {
        console.error("❌ user/overview error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.get("/user/daily", authMiddleware, async (req, res) => {
    const { days = 30 } = req.query;
    const userId = req.user.id;
    try {
        const activity = await pool.query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
      FROM certificates
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY date ORDER BY date ASC;
    `, [userId]);
        res.json({ success: true, data: { activity: activity.rows, tests: activity.rows } });
    } catch (err) {
        console.error("❌ user/daily error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.get("/user/top-courses", authMiddleware, async (req, res) => {
    const { limit = 10 } = req.query;
    const userId = req.user.id;
    try {
        const result = await pool.query(`
      SELECT t.title_ua AS name, COUNT(c.id)::int AS tests_taken, ROUND(AVG(c.percent),1) AS avg_score
      FROM certificates c
      JOIN tests t ON t.id = c.test_id
      WHERE c.user_id = $1
      GROUP BY t.title_ua
      ORDER BY tests_taken DESC
      LIMIT $2;
    `, [userId, limit]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("❌ user/top-courses error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.get("/user/recent", authMiddleware, async (req, res) => {
    const { limit = 20 } = req.query;
    const userId = req.user.id;
    try {
        const result = await pool.query(`
      SELECT created_at, 'certificate' AS type,
             'Ви отримали сертифікат: ' || COALESCE(course, '—') AS description
      FROM certificates
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2;
    `, [userId, limit]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("❌ user/recent error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

export default router;

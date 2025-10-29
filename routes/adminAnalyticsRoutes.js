import express from "express";
import { pool } from "../config/db.js";
import authMiddleware, { isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// --- 1. Overview ---
router.get("/analytics/overview", authMiddleware, isAdmin, async (req, res) => {
    try {
        const [users, active7d, tests, avgScore, certs, passRate] = await Promise.all([
            pool.query("SELECT COUNT(*) FROM users"),
            pool.query("SELECT COUNT(*) FROM users WHERE last_login >= NOW() - INTERVAL '7 days'"),
            pool.query("SELECT COUNT(*) FROM certificates"),
            pool.query("SELECT AVG(percent) FROM certificates"),
            pool.query("SELECT COUNT(*) FROM certificates"),
            pool.query("SELECT AVG(CASE WHEN percent >= 60 THEN 1 ELSE 0 END)::float FROM certificates"),
        ]);

        res.json({
            success: true,
            data: {
                total_users: Number(users.rows[0].count),
                active_last_7d: Number(active7d.rows[0].count),
                registrations_this_week: 0,
                tests_taken: Number(tests.rows[0].count),
                avg_score: Math.round(avgScore.rows[0].avg || 0),
                certificates_issued: Number(certs.rows[0].count),
                pass_rate: Number(passRate.rows[0].avg || 0),
                last_updated: new Date(),
            },
        });
    } catch (err) {
        console.error("❌ overview error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// --- 2. Daily ---
router.get("/analytics/daily", authMiddleware, isAdmin, async (req, res) => {
    const { days = 30 } = req.query;
    try {
        const registrations = await pool.query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY date ORDER BY date ASC;
    `);
        const tests = await pool.query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
      FROM certificates
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY date ORDER BY date ASC;
    `);
        res.json({ success: true, data: { registrations: registrations.rows, tests: tests.rows } });
    } catch (err) {
        console.error("❌ daily error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// --- 3. Top courses ---
router.get("/analytics/top-courses", authMiddleware, isAdmin, async (req, res) => {
    const { limit = 10 } = req.query;
    try {
        const result = await pool.query(`
      SELECT t.title_ua AS name, COUNT(c.id)::int AS tests_taken, ROUND(AVG(c.percent), 1) AS avg_score
      FROM certificates c
      JOIN tests t ON c.test_id = t.id
      GROUP BY t.title_ua
      ORDER BY tests_taken DESC
      LIMIT $1;
    `, [limit]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("❌ top-courses error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// --- 4. Recent events ---
router.get("/analytics/recent", authMiddleware, isAdmin, async (req, res) => {
    const { limit = 20 } = req.query;
    try {
        const result = await pool.query(`
      SELECT created_at, 'certificate' AS type,
             'Сертифікат: ' || course AS description
      FROM certificates
      ORDER BY created_at DESC
      LIMIT $1;
    `, [limit]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("❌ recent error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Dev-only auth debug endpoint (shows req.user if token provided). Enabled only when NODE_ENV !== 'production'
if (process.env.NODE_ENV !== 'production') {
  router.get('/analytics/auth-check', authMiddleware, (req, res) => {
    // return user info (safe for dev only)
    const safeUser = { id: req.user.id, email: req.user.email, role: req.user.role, first_name: req.user.first_name, last_name: req.user.last_name };
    res.json({ success: true, user: safeUser });
  });
}

export default router;

import express from "express";
import { pool } from "../config/db.js";
import authMiddleware, { isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/analytics/overview", authMiddleware, isAdmin, async (req, res) => {
    try {
        const [users, tests, certs, avgScore, payments] = await Promise.all([
            pool.query("SELECT COUNT(*) FROM users"),
            pool.query("SELECT COUNT(*) FROM tests"),
            pool.query("SELECT COUNT(*) FROM certificates"),
            pool.query("SELECT ROUND(AVG(percent),1) FROM certificates"),
            pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status='succeeded') AS success,
          COUNT(*) FILTER (WHERE status='pending') AS pending,
          COALESCE(SUM(amount_cents)/100,0) AS total_usd
        FROM payments;
      `),
        ]);

        res.json({
            success: true,
            data: {
                total_users: Number(users.rows[0].count),
                tests: Number(tests.rows[0].count),
                certificates: Number(certs.rows[0].count),
                avg_percent: Number(avgScore.rows[0].round || 0),
                payments_success: Number(payments.rows[0].success || 0),
                payments_pending: Number(payments.rows[0].pending || 0),
                payments_total: Number(payments.rows[0].total_usd || 0),
                last_updated: new Date(),
            },
        });
    } catch (err) {
        console.error("❌ overview error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.get("/analytics/daily-users", authMiddleware, isAdmin, async (req, res) => {
    try {
        const days = parseInt(req.query.days || "30");
        const users = await pool.query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY date
      ORDER BY date ASC;
    `);
        res.json({ success: true, data: users.rows });
    } catch (err) {
        console.error("❌ daily-users error:", err);
        res.status(500).json({ success: false });
    }
});

router.get("/analytics/payments-daily", authMiddleware, isAdmin, async (req, res) => {
    try {
        const days = parseInt(req.query.days || "30");
        const payments = await pool.query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS date,
             COALESCE(SUM(amount_cents)/100,0) AS total_usd,
             COUNT(*) AS count
      FROM payments
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY date
      ORDER BY date ASC;
    `);
        res.json({ success: true, data: payments.rows });
    } catch (err) {
        console.error("❌ payments-daily error:", err);
        res.status(500).json({ success: false });
    }
});

router.get("/analytics/top-tests", authMiddleware, isAdmin, async (req, res) => {
    try {
        const lang = req.query.lang === "en" ? "en" : "ua";

        const result = await pool.query(`
            SELECT 
                t.title_${lang} AS test,
                COUNT(c.id)::int AS count,
                ROUND(AVG(c.percent), 1) AS avg_score
            FROM certificates c
            JOIN tests t 
              ON LOWER(t.title_${lang}) = LOWER(c.course_en)
              OR LOWER(t.title_${lang}) = LOWER(c.course)
            GROUP BY t.title_${lang}
            ORDER BY count DESC
            LIMIT 10;
        `);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("❌ top-tests error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get("/analytics/top-users", authMiddleware, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                u.id,
                (u.first_name || ' ' || u.last_name) AS name,
                u.email,
                COUNT(p.id)::int AS payments,
                    COALESCE(SUM(p.amount_cents)::float / 100.0, 0)::float AS total_usd
            FROM users u
                     JOIN payments p ON u.id = p.user_id
            WHERE p.status = 'succeeded'
            GROUP BY u.id, u.email, u.first_name, u.last_name
            ORDER BY total_usd DESC
                LIMIT 10;
        `);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("❌ top-users error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;

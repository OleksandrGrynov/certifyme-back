import express from "express";
import { pool } from "../config/db.js";
import authMiddleware, { isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/users", authMiddleware, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                first_name || ' ' || last_name AS full_name,
                email,
                role,
                TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
            FROM users
            ORDER BY id ASC
        `);
        res.json({ success: true, users: result.rows });
    } catch (err) {
        console.error("❌ getAllUsers error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.delete("/users/:id", authMiddleware, isAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;

        const userRes = await client.query(
            "SELECT first_name, last_name, email, role FROM users WHERE id = $1",
            [id]
        );
        if (userRes.rows.length === 0)
            return res
                .status(404)
                .json({ success: false, message: "Користувача не знайдено" });

        const user = userRes.rows[0];
        if (user.role === "admin")
            return res
                .status(403)
                .json({ success: false, message: "Неможливо видалити адміністратора" });

        await client.query("BEGIN");

        await client.query(`
      CREATE TABLE IF NOT EXISTS payment_archive (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        user_email VARCHAR(255),
        user_name VARCHAR(255),
        amount_usd DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

        const payments = await client.query(
            "SELECT amount_cents, created_at FROM payments WHERE user_id = $1",
            [id]
        );

        for (const p of payments.rows) {
            await client.query(
                `INSERT INTO payment_archive (user_id, user_email, user_name, amount_usd, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
                [
                    id,
                    user.email,
                    `${user.first_name} ${user.last_name}`,
                    (p.amount_cents || 0) / 100,
                    p.created_at,
                ]
            );
        }

        await client.query("DELETE FROM certificates WHERE user_id = $1", [id]);
        await client.query("DELETE FROM user_achievements WHERE user_id = $1", [id]);
        await client.query("DELETE FROM user_tests WHERE user_id = $1", [id]);
        await client.query("DELETE FROM payments WHERE user_id = $1", [id]);

        await client.query("DELETE FROM users WHERE id = $1", [id]);

        await client.query("COMMIT");
        res.json({
            success: true,
            message:
                "Користувача та пов'язані дані видалено, оплати архівовано для аналітики.",
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ deleteUser error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    } finally {
        client.release();
    }
});

router.put("/users/:id", authMiddleware, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        const allowedRoles = ["user", "admin"];
        if (!role || !allowedRoles.includes(role)) {
            return res.status(400).json({ success: false, message: "Invalid role" });
        }

        const userRes = await pool.query("SELECT id, role FROM users WHERE id = $1", [id]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });
        }

        const currentRole = userRes.rows[0].role;

        if (currentRole === "admin" && role !== "admin") {
            const adminsCountRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
            const adminsCount = Number(adminsCountRes.rows[0].count || 0);
            if (adminsCount <= 1) {
                return res
                    .status(400)
                    .json({ success: false, message: "Неможливо понизити останнього адміністратора" });
            }
        }

        const updated = await pool.query(
            `UPDATE users SET role = $1 WHERE id = $2 RETURNING id, first_name, last_name, email, role, created_at`,
            [role, id]
        );

        res.json({ success: true, user: updated.rows[0] });
    } catch (err) {
        console.error("❌ updateUserRole error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.get("/certificates", authMiddleware, isAdmin, async (req, res) => {
    try {
        const query = `
            SELECT
                c.*,
                json_build_object(
                        'id', u.id,
                        'name', COALESCE(u.first_name || ' ' || u.last_name, c.user_name),
                        'email', COALESCE(u.email, c.user_email, '-')
                ) AS "user",
                COALESCE(t.title_ua, c.course) AS test_title
            FROM certificates c
                     LEFT JOIN users u ON u.id = c.user_id
                     LEFT JOIN tests t ON t.id = c.test_id
            ORDER BY c.issued DESC;
        `;
        const result = await pool.query(query);
        res.json({ success: true, certificates: result.rows });
    } catch (err) {
        console.error("❌ getAllCertificates error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});


router.delete("/certificates/:id", authMiddleware, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM certificates WHERE id = $1", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ deleteCertificate error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.get("/stats", authMiddleware, isAdmin, async (req, res) => {
    try {
        const [users, tests, certs] = await Promise.all([
            pool.query("SELECT COUNT(*) FROM users"),
            pool.query("SELECT COUNT(*) FROM tests"),
            pool.query("SELECT COUNT(*) FROM certificates"),
        ]);

        const avgPercent = await pool.query("SELECT AVG(percent) FROM certificates");

        const certsByTest = await pool.query(`
            SELECT t.title_ua AS test, COUNT(c.id) AS count
            FROM certificates c
                JOIN tests t ON t.id = c.test_id
            GROUP BY t.title_ua
            ORDER BY count DESC;
        `);

        const usersByMonth = await pool.query(`
            SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COUNT(*) AS count
            FROM users
            WHERE created_at >= NOW() - INTERVAL '12 months'
            GROUP BY month
            ORDER BY month ASC;
        `);

        const paymentsTotal = await pool.query(`
      SELECT SUM(amount_usd)::float AS total_usd FROM (
        SELECT amount_cents / 100.0 AS amount_usd FROM payments
        UNION ALL
        SELECT amount_usd FROM payment_archive
      ) AS all_payments;
    `);

        res.json({
            success: true,
            stats: {
                users: Number(users.rows[0].count),
                tests: Number(tests.rows[0].count),
                certificates: Number(certs.rows[0].count),
                avg_percent: Math.round(avgPercent.rows[0].avg || 0),
                payments_total: Number(paymentsTotal.rows[0].total_usd || 0),
                certs_by_test: certsByTest.rows,
                users_by_month: usersByMonth.rows,
            },
        });
    } catch (err) {
        console.error("❌ getStats error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

export default router;

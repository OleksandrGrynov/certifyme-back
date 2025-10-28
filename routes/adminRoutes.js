// adminRoutes.js
import express from "express";
import { pool } from "../config/db.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { isAdmin } from "../middleware/adminMiddleware.js";

const router = express.Router();

// 🔹 Отримати всіх користувачів
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

// 🔹 Видалити користувача
router.delete("/users/:id", authMiddleware, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const userRes = await pool.query("SELECT role FROM users WHERE id = $1", [id]);
        if (userRes.rows.length === 0)
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });

        if (userRes.rows[0].role === "admin")
            return res.status(403).json({ success: false, message: "Неможливо видалити адміністратора" });

        await pool.query("DELETE FROM users WHERE id = $1", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ deleteUser error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// 🔹 Отримати всі сертифікати
router.get("/certificates", authMiddleware, isAdmin, async (req, res) => {
    try {
        const query = `
            SELECT
                c.id,
                c.cert_id,
                COALESCE(u.first_name || ' ' || u.last_name, c.user_name) AS user_name,
                COALESCE(u.email, '-') AS user_email,
                COALESCE(t.title_ua, c.course) AS test_title,
                c.percent,
                c.issued AS created_at,
                c.expires,
                c.verified
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


// 🔹 Видалити сертифікат
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
// 🔹 Отримати аналітику
// 🔹 Отримати аналітику (оновлено)
router.get("/stats", authMiddleware, isAdmin, async (req, res) => {
    try {
        // Основна статистика
        const [users, tests, certs] = await Promise.all([
            pool.query("SELECT COUNT(*) FROM users"),
            pool.query("SELECT COUNT(*) FROM tests"),
            pool.query("SELECT COUNT(*) FROM certificates"),
        ]);

        const avgPercent = await pool.query("SELECT AVG(percent) FROM certificates");

        // Кількість сертифікатів по тестах
        const certsByTest = await pool.query(`
            SELECT t.title_ua AS test, COUNT(c.id) AS count
            FROM certificates c
                JOIN tests t ON t.id = c.test_id
            GROUP BY t.title_ua
            ORDER BY count DESC;
        `);

        // 📈 Користувачі по місяцях (за останній рік)
        const usersByMonth = await pool.query(`
            SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COUNT(*) AS count
            FROM users
            WHERE created_at >= NOW() - INTERVAL '12 months'
            GROUP BY month
            ORDER BY month ASC;
        `);

        res.json({
            success: true,
            stats: {
                users: Number(users.rows[0].count),
                tests: Number(tests.rows[0].count),
                certificates: Number(certs.rows[0].count),
                avg_percent: Math.round(avgPercent.rows[0].avg || 0),
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

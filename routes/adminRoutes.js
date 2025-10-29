// adminRoutes.js
import express from "express";
import { pool } from "../config/db.js";
import authMiddleware, { isAdmin } from "../middleware/authMiddleware.js";

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
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const userRes = await client.query("SELECT role FROM users WHERE id = $1", [id]);
        if (userRes.rows.length === 0)
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });

        if (userRes.rows[0].role === "admin")
            return res.status(403).json({ success: false, message: "Неможливо видалити адміністратора" });

        // Виконуємо каскадне видалення вручну в транзакції як безпечний fallback
        await client.query("BEGIN");

        // Видаляємо сертифікати, досягнення та інші пов'язані дані
        await client.query("DELETE FROM certificates WHERE user_id = $1", [id]);
        await client.query("DELETE FROM user_achievements WHERE user_id = $1", [id]);
        // Додаткові таблиці, якщо вони є у вашій БД — розкоментуйте або додайте тут
        // await client.query("DELETE FROM reviews WHERE user_id = $1", [id]);
        // await client.query("DELETE FROM submissions WHERE user_id = $1", [id]);

        // Власне видалення користувача
        await client.query("DELETE FROM users WHERE id = $1", [id]);

        await client.query("COMMIT");
        res.json({ success: true });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ deleteUser error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    } finally {
        client.release();
    }
});

// 🔹 Оновити роль користувача (адмін)
router.put("/users/:id", authMiddleware, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        const allowedRoles = ["user", "admin"];
        if (!role || !allowedRoles.includes(role)) {
            return res.status(400).json({ success: false, message: "Invalid role" });
        }

        // Перевіряємо, чи існує користувач
        const userRes = await pool.query("SELECT id, role FROM users WHERE id = $1", [id]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });
        }

        const currentRole = userRes.rows[0].role;

        // Якщо намагаються понизити останнього адміна — заборонити
        if (currentRole === "admin" && role !== "admin") {
            const adminsCountRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
            const adminsCount = Number(adminsCountRes.rows[0].count || 0);
            if (adminsCount <= 1) {
                return res.status(400).json({ success: false, message: "Неможливо понизити останнього адміністратора" });
            }
        }

        // Оновлюємо роль
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

// 🔹 Отримати всі сертифікати
router.get("/certificates", authMiddleware, isAdmin, async (req, res) => {
    try {
        const query = `
            SELECT
                c.*,
                -- Повертаємо master user як JSON-об'єкт (якщо є), але зберігаємо legacy-поля для backward-compat
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

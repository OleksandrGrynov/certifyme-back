import express from "express";
import { pool } from "../config/db.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { isAdmin } from "../middleware/adminMiddleware.js";

const router = express.Router();

// 🔹 Отримати налаштування
router.get("/", authMiddleware, isAdmin, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM settings LIMIT 1");
        res.json({ success: true, settings: result.rows[0] || {} });
    } catch (err) {
        console.error("❌ getSettings error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// 🔹 Оновити налаштування
router.put("/", authMiddleware, isAdmin, async (req, res) => {
    const { email_support, telegram, phone } = req.body;
    try {
        const result = await pool.query(`
            INSERT INTO settings (id, email_support, telegram, phone)
            VALUES (1, $1, $2, $3)
            ON CONFLICT (id)
            DO UPDATE SET email_support = $1, telegram = $2, phone = $3;
        `, [email_support, telegram, phone]);
        res.json({ success: true, message: "✅ Налаштування збережено" });
    } catch (err) {
        console.error("❌ updateSettings error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});
// /api/admin/system
router.get("/system", authMiddleware, isAdmin, async (req, res) => {
    res.json({
        success: true,
        info: {
            apiVersion: "1.2.3",
            dbStatus: "Connected",
            uptime: "134 години",
            activeQueries: 5,
        },
    });
});

// /api/admin/insights
router.get("/insights", authMiddleware, isAdmin, async (req, res) => {
    const result = await pool.query(`
        SELECT
            (SELECT title_ua FROM tests ORDER BY id DESC LIMIT 1) AS last_test,
            (SELECT COUNT(*) FROM users) AS users_count,
            (SELECT AVG(percent) FROM certificates) AS avg_percent
    `);
    const data = result.rows[0];
    const insights = [
        `Наразі ${data.users_count} зареєстрованих користувачів.`,
        `Середній рівень проходження тестів — ${Math.round(data.avg_percent)}%.`,
        `Останній доданий тест: ${data.last_test}.`,
    ];
    res.json({ success: true, insights });
});
export default router;

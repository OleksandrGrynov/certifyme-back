import express from "express";
import { pool } from "../config/db.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { isAdmin } from "../middleware/adminMiddleware.js";

const router = express.Router();

/* -------------------- ⚙️ Основні налаштування -------------------- */
router.get("/", authMiddleware, isAdmin, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM settings LIMIT 1");
        res.json({ success: true, settings: result.rows[0] || {} });
    } catch (err) {
        console.error("❌ getSettings error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.put("/", authMiddleware, isAdmin, async (req, res) => {
    const { email_support, telegram, phone } = req.body;
    try {
        await pool.query(
            `
            INSERT INTO settings (id, email_support, telegram, phone)
            VALUES (1, $1, $2, $3)
            ON CONFLICT (id)
            DO UPDATE SET email_support = $1, telegram = $2, phone = $3;
        `,
            [email_support, telegram, phone]
        );
        res.json({ success: true, message: "✅ Settings updated" });
    } catch (err) {
        console.error("❌ updateSettings error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* -------------------- 💻 Системна інформація -------------------- */
router.get("/system", authMiddleware, isAdmin, async (req, res) => {
    const lang = req.query.lang || "uk";

    const info = {
        apiVersion: "1.2.3",
        dbStatus: lang === "en" ? "Connected" : "Підключено",
        uptime: lang === "en" ? "134 hours" : "134 години",
        activeQueries: 5,
    };

    res.json({ success: true, info });
});

/* -------------------- 🤖 AI інсайти -------------------- */
router.get("/insights", authMiddleware, isAdmin, async (req, res) => {
    const lang = req.query.lang || "uk";
    try {
        const result = await pool.query(`
            SELECT
                (SELECT title_ua FROM tests ORDER BY id DESC LIMIT 1) AS last_test_ua,
                (SELECT title_en FROM tests ORDER BY id DESC LIMIT 1) AS last_test_en,
                (SELECT COUNT(*) FROM users) AS users_count,
                (SELECT AVG(percent) FROM certificates) AS avg_percent
        `);

        const data = result.rows[0];
        const avg = Math.round(data.avg_percent || 0);

        const insights =
            lang === "en"
                ? [
                    `Currently ${data.users_count} registered users.`,
                    `Average test completion rate — ${avg}%.`,
                    `Last added test: ${data.last_test_en || data.last_test_ua}.`,
                ]
                : [
                    `Наразі ${data.users_count} зареєстрованих користувачів.`,
                    `Середній рівень проходження тестів — ${avg}%.`,
                    `Останній доданий тест: ${data.last_test_ua}.`,
                ];

        res.json({ success: true, insights });
    } catch (err) {
        console.error("❌ insights error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

export default router;

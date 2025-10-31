import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { pool } from "../config/db.js";

const router = express.Router();

/**
 * ✅ Отримати всі тести користувача
 *    Повертає масив testId
 */
router.get("/tests", authMiddleware, async (req, res) => {
    try {
        const { rows } = await pool.query(
            "SELECT test_id FROM user_tests WHERE user_id=$1",
            [req.user.id]
        );
        res.json({ testIds: rows.map(r => r.test_id) });
    } catch (err) {
        console.error("❌ user/tests error:", err);
        res.status(500).json({ message: "Помилка при отриманні тестів" });
    }
});

/**
 * ✅ Перевірити доступ до конкретного тесту
 */
router.get("/tests/check/:testId", authMiddleware, async (req, res) => {
    try {
        const { testId } = req.params;
        const result = await pool.query(
            "SELECT 1 FROM user_tests WHERE user_id=$1 AND test_id=$2 LIMIT 1",
            [req.user.id, testId]
        );
        res.json({ hasAccess: result.rowCount > 0 });
    } catch (err) {
        console.error("❌ check access error:", err);
        res.status(500).json({ hasAccess: false });
    }
});

/**
 * ✅ Надати доступ користувачу до тесту (після оплати)
 *    Викликається фронтом при `?paid=true`
 */
router.post("/tests/grant", authMiddleware, async (req, res) => {
    try {
        const { testId } = req.body;
        if (!testId) {
            return res.status(400).json({ success: false, message: "❌ testId required" });
        }

        const query = `
            INSERT INTO user_tests (user_id, test_id, granted_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (user_id, test_id) DO NOTHING
        `;
        await pool.query(query, [req.user.id, testId]);

        res.json({ success: true, message: "✅ Access granted successfully" });
    } catch (err) {
        console.error("❌ grant test access error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

export default router;

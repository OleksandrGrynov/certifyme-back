import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { pool } from "../config/db.js";

const router = express.Router();

// ✅ Повертає масив testId, на які користувач має доступ
router.get("/tests", authMiddleware, async (req, res) => {
    try {
        const { rows } = await pool.query(
            "SELECT test_id FROM user_tests WHERE user_id=$1",
            [req.user.id]
        );
        res.json({ testIds: rows.map(r => r.test_id) });
    } catch (err) {
        console.error("❌ Помилка user/tests:", err);
        res.status(500).json({ message: "Помилка при отриманні тестів" });
    }
});

// ✅ Перевіряє, чи має користувач доступ до конкретного тесту
router.get("/tests/check/:testId", authMiddleware, async (req, res) => {
    try {
        const { testId } = req.params;
        const { id: userId } = req.user;

        const result = await pool.query(
            "SELECT 1 FROM user_tests WHERE user_id=$1 AND test_id=$2 LIMIT 1",
            [userId, testId]
        );

        res.json({ hasAccess: result.rowCount > 0 });
    } catch (err) {
        console.error("❌ Помилка перевірки доступу:", err);
        res.status(500).json({ message: "Помилка при перевірці доступу" });
    }
});

export default router;

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { pool } from "../config/db.js";

const router = express.Router();

// повертає масив testId, на які користувач має доступ
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

export default router;

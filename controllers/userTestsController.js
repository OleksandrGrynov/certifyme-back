import { pool } from "../config/db.js";

// ✅ Всі тести користувача
export const getUserTests = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const result = await pool.query(
            "SELECT test_id FROM user_tests WHERE user_id = $1 ORDER BY granted_at DESC",
            [userId]
        );

        const testIds = result.rows.map(r => r.test_id);
        res.json({ testIds });
    } catch (err) {
        console.error("❌ Error fetching user tests:", err);
        res.status(500).json({ message: "Database error" });
    }
};

// ✅ Перевірка доступу до одного тесту
export const checkUserTestAccess = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const { testId } = req.params;

        const result = await pool.query(
            "SELECT 1 FROM user_tests WHERE user_id = $1 AND test_id = $2 LIMIT 1",
            [userId, testId]
        );

        res.json({ hasAccess: result.rowCount > 0 });
    } catch (err) {
        console.error("❌ Error checking access:", err);
        res.status(500).json({ message: "Database error" });
    }
};

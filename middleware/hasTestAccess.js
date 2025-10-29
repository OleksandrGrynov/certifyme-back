import { pool } from "../config/db.js";

export default async function hasTestAccess(req, res, next) {
    const testId = req.params.testId || req.body.testId;
    const { rows } = await pool.query(
        "SELECT 1 FROM user_tests WHERE user_id=$1 AND test_id=$2 LIMIT 1",
        [req.user.id, testId]
    );
    if (!rows.length) return res.status(402).json({ message: "Потрібна оплата для доступу" });
    next();
}

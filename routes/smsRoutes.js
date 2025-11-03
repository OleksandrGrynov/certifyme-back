import express from "express";
import { verifyToken, isAdmin } from "../middleware/authMiddleware.js";
import { pool } from "../config/db.js";
import { sendSMS } from "../services/twilioService.js";

const router = express.Router();

/* ────────────────────────────────────────────────────────────────
   ✅ 1. Перевірка, чи користувач підписаний
   ──────────────────────────────────────────────────────────────── */
router.get("/check", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const existing = await pool.query(
            "SELECT * FROM sms_subscriptions WHERE user_id = $1 LIMIT 1",
            [userId]
        );
        res.json({ subscribed: existing.rows.length > 0 });
    } catch (err) {
        console.error("❌ Check SMS subscription error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* ────────────────────────────────────────────────────────────────
   ✅ 2. Додати користувача в підписку
   ──────────────────────────────────────────────────────────────── */
router.post("/subscribe", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { phone } = req.body;

        if (!phone)
            return res.status(400).json({ success: false, message: "Phone required" });

        const existing = await pool.query(
            "SELECT id FROM sms_subscriptions WHERE user_id = $1",
            [userId]
        );
        if (existing.rows.length > 0)
            return res.json({ success: true, message: "Already subscribed" });

        await pool.query(
            "INSERT INTO sms_subscriptions (user_id, phone) VALUES ($1, $2)",
            [userId, phone]
        );

        res.json({ success: true, message: "Subscription saved" });
    } catch (err) {
        console.error("❌ Subscribe error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* ────────────────────────────────────────────────────────────────
   📣 3. Адмінська розсилка SMS через Twilio
   ──────────────────────────────────────────────────────────────── */
router.post("/send-promo", verifyToken, isAdmin, async (req, res) => {
    try {
        const { message } = req.body;

        if (!message?.trim())
            return res.status(400).json({ success: false, message: "Повідомлення не може бути порожнім" });

        // Отримуємо всі номери з БД
        const { rows: subs } = await pool.query("SELECT phone FROM sms_subscriptions");
        if (subs.length === 0)
            return res.json({ success: false, message: "Немає підписаних користувачів" });

        let sentCount = 0;
        for (const s of subs) {
            const phone = s.phone.startsWith("+") ? s.phone : `+${s.phone}`;
            const result = await sendSMS(phone, message);
            if (result.success) sentCount++;
        }

        res.json({
            success: true,
            message: `✅ Розсилка виконана: ${sentCount}/${subs.length} повідомлень`,
        });
    } catch (err) {
        console.error("❌ sendPromo error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});
// 🔢 Підрахунок кількості SMS-підписників
router.get("/count", verifyToken, isAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT COUNT(*) FROM sms_subscriptions");
        res.json({ count: parseInt(rows[0].count, 10) });
    } catch (err) {
        console.error("❌ Count error:", err);
        res.status(500).json({ success: false, count: 0 });
    }
});

export default router;

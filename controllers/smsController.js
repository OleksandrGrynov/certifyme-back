import twilio from "twilio";
import pool from "../config/db.js";

// 🔐 ініціалізація Twilio
const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

/**
 * 📩 Надсилання рекламного SMS усім підписникам
 * доступно тільки адміну
 */
export const sendPromoSMS = async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || message.trim() === "")
            return res.status(400).json({ success: false, message: "Повідомлення не може бути порожнім" });

        // 🔹 Отримуємо всі номери з бази
        const { rows: subs } = await pool.query("SELECT phone FROM sms_subscriptions");
        if (subs.length === 0)
            return res.json({ success: false, message: "Немає підписаних користувачів" });

        let sentCount = 0;

        // 🔁 Надсилаємо кожному
        for (const s of subs) {
            try {
                await client.messages.create({
                    body: message,
                    from: process.env.TWILIO_PHONE_NUMBER, // твій Twilio номер
                    to: s.phone.startsWith("+") ? s.phone : `+${s.phone}`,
                });
                sentCount++;
            } catch (err) {
                console.warn("⚠️ SMS skip for", s.phone, err.message);
            }
        }

        res.json({
            success: true,
            message: `Розсилка виконана: ${sentCount} повідомлень`,
        });
    } catch (err) {
        console.error("❌ sendPromoSMS error:", err);
        res.status(500).json({ success: false, message: "Помилка сервера при надсиланні SMS" });
    }
};

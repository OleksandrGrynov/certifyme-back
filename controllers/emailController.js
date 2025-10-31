// controllers/emailController.js
import { pool } from "../config/db.js";
import { Resend } from "resend";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

// Ініціалізація Resend
const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM;

// 📤 Надіслати код підтвердження
export async function sendEmailCode(req, res) {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res
                .status(401)
                .json({ success: false, message: "Немає токена авторизації" });
        }

        const { id, email } = jwt.verify(token, process.env.JWT_SECRET);
        console.log("📧 Надсилання коду на:", email);

        // Перевірка змінних середовища
        if (!process.env.RESEND_API_KEY) {
            console.error("❌ RESEND_API_KEY відсутній");
            return res
                .status(500)
                .json({ success: false, message: "Не знайдено ключ RESEND_API_KEY" });
        }

        if (!EMAIL_FROM) {
            console.error("❌ EMAIL_FROM не заданий у .env");
            return res
                .status(500)
                .json({ success: false, message: "EMAIL_FROM не заданий у конфігурації" });
        }

        // Забороняємо використання onboarding@resend.dev
        if (EMAIL_FROM.includes("resend.dev")) {
            console.error("❌ EMAIL_FROM все ще onboarding@resend.dev — змініть у .env");
            return res.status(400).json({
                success: false,
                message:
                    "EMAIL_FROM використовує адресу resend.dev. Замініть її на адресу вашого домену (наприклад no-reply@certifyme.me)",
            });
        }

        // Генеруємо 6-значний код
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Зберігаємо код у БД
        await pool.query(
            `INSERT INTO email_verifications (user_id, email, code)
             VALUES ($1, $2, $3)`,
            [id, email, code]
        );

        // Надсилаємо лист
        const html = `
            <div style="font-family:Inter,Arial,sans-serif;padding:20px;background:#111;color:#eee;border-radius:10px;">
                <h2 style="color:#4ade80;">CertifyMe</h2>
                <p>Ваш код підтвердження:</p>
                <p style="font-size:32px;letter-spacing:6px;color:#4ade80;text-align:center;"><b>${code}</b></p>
                <p>Код дійсний протягом <b>10 хвилин</b>.</p>
            </div>`;

        let sendResult;
        try {
            sendResult = await resend.emails.send({
                from: EMAIL_FROM,
                to: email,
                subject: "Код підтвердження | CertifyMe",
                html,
            });

            console.log("✅ Лист відправлено через Resend:", sendResult?.id || sendResult);
        } catch (sendErr) {
            console.error("❌ Помилка Resend:", sendErr?.message || sendErr);
            return res.status(500).json({
                success: false,
                message: "Помилка при надсиланні листа через Resend",
                detail: sendErr?.message || sendErr,
            });
        }

        res.json({
            success: true,
            message: "Код надіслано ✅",
            emailSendId: sendResult?.id,
        });
    } catch (err) {
        console.error("❌ sendEmailCode error:", err);
        res
            .status(500)
            .json({ success: false, message: "Не вдалося надіслати код підтвердження" });
    }
}

// ✅ Перевірити код підтвердження
export async function verifyEmailCode(req, res) {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        const { id } = jwt.verify(token, process.env.JWT_SECRET);
        const { code } = req.body;

        const result = await pool.query(
            `SELECT * FROM email_verifications
             WHERE user_id=$1 AND code=$2 AND used=FALSE
               AND created_at > NOW() - INTERVAL '10 minutes'
             ORDER BY created_at DESC LIMIT 1`,
            [id, code]
        );

        if (!result.rows.length) {
            return res.status(400).json({
                success: false,
                message: "Невірний або прострочений код підтвердження",
            });
        }

        await pool.query(
            `UPDATE email_verifications SET used=TRUE WHERE id=$1`,
            [result.rows[0].id]
        );
        await pool.query(`UPDATE users SET email_verified=TRUE WHERE id=$1`, [id]);

        res.json({ success: true, message: "Пошту успішно підтверджено 💚" });
    } catch (err) {
        console.error("❌ verifyEmailCode error:", err);
        res
            .status(500)
            .json({ success: false, message: "Помилка при перевірці коду підтвердження" });
    }
}

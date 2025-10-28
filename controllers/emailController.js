import { pool } from "../config/db.js";
import { Resend } from "resend";
import jwt from "jsonwebtoken";

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || "onboarding@resend.dev";

// 📤 Надіслати код
export async function sendEmailCode(req, res) {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) return res.status(401).json({ success: false, message: "Немає токена" });

        const { id, email } = jwt.verify(token, process.env.JWT_SECRET);
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        await pool.query(
            `INSERT INTO email_verifications (user_id, email, code)
             VALUES ($1,$2,$3)`,
            [id, email, code]
        );

        await resend.emails.send({
            from: EMAIL_FROM,
            to: email,
            subject: "Код підтвердження CertifyMe",
            html: `
                <div style="font-family:Inter,Arial,sans-serif;padding:20px">
                    <h2 style="color:#16a34a">CertifyMe</h2>
                    <p>Ваш код підтвердження:</p>
                    <p style="font-size:32px;letter-spacing:4px"><b>${code}</b></p>
                    <p>Діє 10 хвилин.</p>
                </div>`
        });

        res.json({ success: true, message: "Код надіслано ✅" });
    } catch (err) {
        console.error("❌ sendEmailCode error:", err);
        res.status(500).json({ success: false, message: "Не вдалося надіслати код" });
    }
}

// ✅ Перевірити код
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

        if (!result.rows.length)
            return res.status(400).json({ success: false, message: "Невірний або прострочений код" });

        await pool.query(`UPDATE email_verifications SET used=TRUE WHERE id=$1`, [result.rows[0].id]);
        await pool.query(`UPDATE users SET email_verified=TRUE WHERE id=$1`, [id]);

        res.json({ success: true, message: "Пошту підтверджено 💚" });
    } catch (err) {
        console.error("❌ verifyEmailCode error:", err);
        res.status(500).json({ success: false, message: "Помилка підтвердження" });
    }
}

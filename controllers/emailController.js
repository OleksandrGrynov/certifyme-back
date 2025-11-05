import prisma from "../config/prisma.js";
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

        // Перевірки конфігурації
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

        if (EMAIL_FROM.includes("resend.dev")) {
            return res.status(400).json({
                success: false,
                message:
                    "EMAIL_FROM використовує адресу resend.dev. Замініть її на адресу вашого домену (наприклад no-reply@certifyme.me)",
            });
        }

        // Генеруємо 6-значний код
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Зберігаємо код у БД
        await prisma.emailVerification.create({
            data: {
                userId: id,
                email,
                code,
                used: false,
            },
        });

        // HTML листа
        const html = `
      <div style="font-family:Inter,Arial,sans-serif;padding:20px;background:#111;color:#eee;border-radius:10px;">
        <h2 style="color:#4ade80;">CertifyMe</h2>
        <p>Ваш код підтвердження:</p>
        <p style="font-size:32px;letter-spacing:6px;color:#4ade80;text-align:center;"><b>${code}</b></p>
        <p>Код дійсний протягом <b>10 хвилин</b>.</p>
      </div>
    `;

        // Надсилаємо лист
        try {
            const sendResult = await resend.emails.send({
                from: EMAIL_FROM,
                to: email,
                subject: "Код підтвердження | CertifyMe",
                html,
            });

            console.log("✅ Лист відправлено через Resend:", sendResult?.id || sendResult);

            return res.json({
                success: true,
                message: "Код надіслано ✅",
                emailSendId: sendResult?.id,
            });
        } catch (sendErr) {
            console.error("❌ Помилка Resend:", sendErr?.message || sendErr);
            return res.status(500).json({
                success: false,
                message: "Помилка при надсиланні листа через Resend",
                detail: sendErr?.message || sendErr,
            });
        }
    } catch (err) {
        console.error("❌ sendEmailCode error:", err);
        res.status(500).json({
            success: false,
            message: "Не вдалося надіслати код підтвердження",
        });
    }
}

// ✅ Перевірити код підтвердження
export async function verifyEmailCode(req, res) {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token)
            return res
                .status(401)
                .json({ success: false, message: "Немає токена авторизації" });

        const { id } = jwt.verify(token, process.env.JWT_SECRET);
        const { code } = req.body;

        // Знайти останній код, створений за 10 хвилин, ще не використаний
        const record = await prisma.emailVerification.findFirst({
            where: {
                userId: id,
                code,
                used: false,
                createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
            },
            orderBy: { createdAt: "desc" },
        });

        if (!record) {
            return res.status(400).json({
                success: false,
                message: "Невірний або прострочений код підтвердження",
            });
        }

        // Транзакція — позначаємо код використаним і підтверджуємо користувача
        await prisma.$transaction(async (tx) => {
            await tx.emailVerification.update({
                where: { id: record.id },
                data: { used: true },
            });

            await tx.user.update({
                where: { id },
                data: { emailVerified: true },
            });
        });

        res.json({ success: true, message: "Пошту успішно підтверджено 💚" });
    } catch (err) {
        console.error("❌ verifyEmailCode error:", err);
        res.status(500).json({
            success: false,
            message: "Помилка при перевірці коду підтвердження",
        });
    }
}

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { pool } from "../config/db.js";
import { initUserAchievements } from "../models/AchievementModel.js";
import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();
const resend = new Resend(process.env.RESEND_API_KEY);

// ======================================================
// 📩 Надсилання OTP-коду (6 цифр)
// ======================================================
async function sendOtpEmail(email, otp) {
    const html = `
      <div style="font-family:sans-serif;padding:20px;background:#111;color:#eee;border-radius:10px;">
        <h2 style="color:#4ade80;">CertifyMe — підтвердження пошти</h2>
        <p>Привіт! Дякуємо за реєстрацію 💚</p>
        <p>Щоб активувати акаунт, введи цей код підтвердження:</p>
        <h1 style="font-size:36px;letter-spacing:6px;color:#4ade80;text-align:center;margin:20px 0;">${otp}</h1>
        <p>Код дійсний 10 хвилин. Якщо ти не реєструвався — просто ігноруй цей лист.</p>
      </div>
    `;

    try {
        const response = await resend.emails.send({
            from: "CertifyMe <onboarding@resend.dev>",
            to: email,
            subject: "Код підтвердження | CertifyMe",
            html,
        });
        console.log("✅ OTP email sent:", response);
    } catch (err) {
        console.error("❌ OTP email send error:", err);
    }
}

// ======================================================
// 🔹 Реєстрація користувача (створюємо OTP)
// ======================================================
export const registerUser = async (req, res) => {
    try {
        const { first_name, last_name, email, password } = req.body;

        if (!first_name || !last_name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Будь ласка, заповніть усі поля (імʼя, прізвище, email, пароль)",
            });
        }

        const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, message: "Email вже використовується" });
        }

        const hashed = await bcrypt.hash(password, 10);

        // Генеруємо 6-значний OTP і термін дії
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 хв

        const result = await pool.query(
            `INSERT INTO users (first_name, last_name, email, password, role, created_at, is_verified, otp_code, otp_expires)
             VALUES ($1, $2, $3, $4, 'user', NOW(), false, $5, $6)
             RETURNING id, first_name, last_name, email, role, created_at`,
            [first_name, last_name, email, hashed, otp, expires]
        );

        const user = result.rows[0];
        await initUserAchievements(user.id);

        await sendOtpEmail(email, otp);

        res.json({
            success: true,
            message: "✅ Код підтвердження надіслано на пошту. Перевірте пошту та введіть 6 цифр.",
        });
    } catch (err) {
        console.error("❌ registerUser error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ======================================================
// 🔹 Перевірка OTP-коду
// ======================================================
export const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ success: false, message: "Введіть email і код" });
        }

        const result = await pool.query(
            `SELECT * FROM users WHERE email = $1 AND otp_code = $2`,
            [email, otp]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: "❌ Невірний код підтвердження" });
        }

        const user = result.rows[0];
        const now = new Date();
        const expires = new Date(user.otp_expires);

        if (now > expires) {
            return res.status(400).json({ success: false, message: "⏰ Код прострочений. Зареєструйтеся знову." });
        }

        // ✅ Підтверджуємо акаунт
        await pool.query(
            `UPDATE users SET is_verified = true, otp_code = NULL, otp_expires = NULL WHERE email = $1`,
            [email]
        );

        // Створюємо JWT токен після підтвердження
        const token = jwt.sign(
            { id: user.id, role: user.role, first_name: user.first_name, last_name: user.last_name },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            message: "✅ Акаунт підтверджено. Вхід виконано.",
            token,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (err) {
        console.error("❌ verifyOtp error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ======================================================
// 🔹 Логін користувача (тільки після підтвердження OTP)
// ======================================================
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: "Користувача не знайдено" });
        }

        const user = result.rows[0];
        const isValid = await bcrypt.compare(password, user.password);

        if (!isValid) {
            return res.status(401).json({ success: false, message: "Невірний пароль" });
        }

        if (!user.is_verified) {
            return res.status(403).json({
                success: false,
                message: "Будь ласка, підтвердіть пошту за допомогою коду, який ми надіслали.",
            });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role, first_name: user.first_name, last_name: user.last_name },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            message: "Вхід успішний ✅",
            token,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                role: user.role,
                created_at: user.created_at,
            },
        });
    } catch (err) {
        console.error("❌ loginUser error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ======================================================
// 🔹 Отримати поточного користувача
// ======================================================
export const getCurrentUser = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token)
            return res.status(401).json({ success: false, message: "Немає токена авторизації" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const userRes = await pool.query(
            `SELECT id, first_name, last_name, email, role, created_at, is_verified
             FROM users WHERE id = $1`,
            [decoded.id]
        );

        if (userRes.rows.length === 0)
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });

        res.json({ success: true, user: userRes.rows[0] });
    } catch (err) {
        console.error("❌ getCurrentUser error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ======================================================
// 🔹 Оновлення профілю
// ======================================================
export const updateProfile = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token)
            return res.status(401).json({ success: false, message: "Немає токена авторизації" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { first_name, last_name, email } = req.body;

        if (!first_name || !last_name || !email) {
            return res.status(400).json({
                success: false,
                message: "Усі поля обовʼязкові (імʼя, прізвище, email)",
            });
        }

        const result = await pool.query(
            `UPDATE users
             SET first_name = $1, last_name = $2, email = $3
             WHERE id = $4
             RETURNING id, first_name, last_name, email, role, created_at, is_verified`,
            [first_name, last_name, email, decoded.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });
        }

        res.json({
            success: true,
            message: "Профіль оновлено ✅",
            user: result.rows[0],
        });
    } catch (err) {
        console.error("❌ updateProfile error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ======================================================
// 🔒 Зміна пароля
// ======================================================
export const changePassword = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token)
            return res.status(401).json({ success: false, message: "Немає токена авторизації" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { oldPassword, newPassword } = req.body;

        const userRes = await pool.query("SELECT password FROM users WHERE id = $1", [decoded.id]);
        if (userRes.rows.length === 0)
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });

        const isMatch = await bcrypt.compare(oldPassword, userRes.rows[0].password);
        if (!isMatch)
            return res.status(400).json({ success: false, message: "Старий пароль невірний" });

        const hashed = await bcrypt.hash(newPassword, 10);
        await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, decoded.id]);

        res.json({ success: true, message: "Пароль успішно змінено ✅" });
    } catch (err) {
        console.error("❌ changePassword error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
// ======================================================
// 🔑 Створення пароля після Google-авторизації
// ======================================================
export const setPassword = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token)
            return res
                .status(401)
                .json({ success: false, message: "Немає токена авторизації" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;

        const { newPassword } = req.body;
        if (!newPassword)
            return res
                .status(400)
                .json({ success: false, message: "Поле newPassword обов'язкове" });

        // Перевіряємо, чи існує користувач
        const userRes = await pool.query(
            "SELECT id FROM users WHERE id = $1",
            [userId]
        );
        if (userRes.rows.length === 0)
            return res
                .status(404)
                .json({ success: false, message: "Користувача не знайдено" });

        // Хешуємо пароль
        const hashed = await bcrypt.hash(newPassword, 10);
        await pool.query(
            "UPDATE users SET password = $1 WHERE id = $2",
            [hashed, userId]
        );

        res.json({
            success: true,
            message: "Пароль успішно створено ✅",
        });
    } catch (err) {
        console.error("❌ setPassword error:", err.message);
        res
            .status(500)
            .json({ success: false, message: "Помилка сервера під час збереження пароля" });
    }
};

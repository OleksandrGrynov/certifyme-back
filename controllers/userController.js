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
            from: process.env.EMAIL_FROM,
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
// ======================================================
// 📩 Відновлення пароля — запит на скидання
// ======================================================
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email)
            return res.status(400).json({ success: false, message: "Вкажіть email" });

        const userRes = await pool.query("SELECT id, first_name FROM users WHERE email = $1", [email]);
        if (userRes.rows.length === 0)
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });

        const user = userRes.rows[0];

        // 🔐 Генеруємо токен
        const resetToken = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 хв

        await pool.query(
            `UPDATE users SET reset_token = $1, reset_expires = $2 WHERE email = $3`,
            [resetToken, expires, email]
        );

        // 🔗 Посилання на фронт
        const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

        // ✉️ HTML-лист
        const html = `
          <div style="font-family:system-ui, sans-serif; background:#0d1117; color:#e2e8f0; padding:30px; border-radius:12px; max-width:520px; margin:auto;">
            <h2 style="color:#4ade80; text-align:center;">🔐 Відновлення пароля | CertifyMe</h2>
            <p>Привіт, <b>${user.first_name}</b>!</p>
            <p>Ми отримали запит на зміну пароля до твого акаунта.</p>
            <p>Натисни кнопку нижче, щоб створити новий пароль:</p>
            <div style="text-align:center; margin:30px 0;">
              <a href="${resetLink}" 
                 style="background:#4ade80;color:#000;padding:12px 26px;text-decoration:none;border-radius:8px;font-weight:600;">
                 🔁 Змінити пароль
              </a>
            </div>
            <p>Це посилання дійсне протягом <b>15 хвилин</b>.</p>
            <p style="font-size:14px;color:#94a3b8;">Якщо ти не надсилав запит, просто проігноруй цей лист.</p>
          </div>
        `;

        await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: "Відновлення пароля | CertifyMe",
            html,
        });

        res.json({
            success: true,
            message: "📨 Лист із інструкцією надіслано на пошту.",
        });
    } catch (err) {
        console.error("❌ forgotPassword error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ======================================================
// 🔑 Встановлення нового пароля після переходу з листа
// ======================================================
export const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword)
            return res.status(400).json({ success: false, message: "Немає токена або нового пароля" });

        const result = await pool.query(
            `SELECT id, reset_expires FROM users WHERE reset_token = $1`,
            [token]
        );

        if (result.rows.length === 0)
            return res.status(400).json({ success: false, message: "Невірний токен" });

        const user = result.rows[0];
        if (new Date() > new Date(user.reset_expires))
            return res.status(400).json({ success: false, message: "Токен прострочений" });

        const hashed = await bcrypt.hash(newPassword, 10);
        await pool.query(
            `UPDATE users 
             SET password = $1, reset_token = NULL, reset_expires = NULL 
             WHERE id = $2`,
            [hashed, user.id]
        );

        res.json({ success: true, message: "Пароль успішно змінено ✅" });
    } catch (err) {
        console.error("❌ resetPassword error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
// ======================================================
// 🧾 Grant access to test (force success stub mode)
// ======================================================
export const grantUserTest = async (req, res) => {
    try {
        const { testId } = req.body;
        const userId = req.user?.id;

        if (!userId || !testId) {
            return res.status(400).json({ success: false, message: "Missing data" });
        }

        console.log("💳 FORCED grantUserTest:", { userId, testId });

        // 💥 Примусово ставимо всі платежі succeeded
        await pool.query(
            `UPDATE payments
       SET status = 'succeeded'
       WHERE user_id = $1 AND test_id = $2`,
            [userId, testId]
        );

        // 💾 Якщо платежу взагалі не було — створюємо новий успішний
        const check = await pool.query(
            `SELECT id FROM payments WHERE user_id=$1 AND test_id=$2`,
            [userId, testId]
        );

        if (check.rows.length === 0) {
            await pool.query(
                `INSERT INTO payments (user_id, test_id, amount_cents, currency, status, created_at)
                 VALUES ($1, $2, 1000, 'usd', 'succeeded', NOW())`,
                [userId, testId]
            );
            console.log(`✅ Created forced payment record for user ${userId}, test ${testId}`);
        } else {
            console.log(`✅ Forced updated existing payment(s) to succeeded`);
        }

        // ✅ Відкриваємо доступ до тесту
        await pool.query(
            `INSERT INTO user_tests (user_id, test_id, is_unlocked)
             VALUES ($1, $2, true)
                 ON CONFLICT (user_id, test_id)
       DO UPDATE SET is_unlocked = true`,
            [userId, testId]
        );

        console.log(`🚀 Test #${testId} forcibly unlocked for user #${userId}`);
        res.json({ success: true, message: "✅ Payment forced to succeeded, test unlocked" });
    } catch (err) {
        console.error("❌ grantUserTest error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

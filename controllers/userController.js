// controllers/userController.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../config/prisma.js";
import { initUserAchievements } from "../models/AchievementModel.js";
import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();
const resend = new Resend(process.env.RESEND_API_KEY);

// ======================================================
// 🧠 Перевірка складності пароля
// Мінімум 6 символів, 1 велика літера, 1 цифра, 1 спецсимвол
// ======================================================
function validatePassword(password) {
    const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=<>?{}[\]~.,]).{6,}$/;
    return regex.test(password);
}

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
    </div>`;

    try {
        await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: "Код підтвердження | CertifyMe",
            html,
        });
        console.log("✅ OTP email sent:", email);
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

        // 🔹 1. Перевіряємо, чи всі поля заповнені
        if (!first_name || !last_name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Будь ласка, заповніть усі поля (імʼя, прізвище, email, пароль)",
            });
        }

        // 🔹 2. Перевіряємо складність пароля
        if (!validatePassword(password)) {
            return res.status(400).json({
                success: false,
                message:
                    "Пароль має містити мінімум 6 символів, одну велику літеру, цифру та спецсимвол (наприклад: !, @, #, ., ,)",
            });
        }

        // 🔹 3. Перевіряємо, чи існує користувач
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res
                .status(400)
                .json({ success: false, message: "Email вже використовується" });
        }

        // 🔹 4. Хешуємо пароль і створюємо OTP
        const hashed = await bcrypt.hash(password, 10);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000);

        const user = await prisma.user.create({
            data: {
                firstName: first_name,
                lastName: last_name,
                email,
                password: hashed,
                role: "user",
                isVerified: false,
                otpCode: otp,
                otpExpires: expires,
            },
        });

        await initUserAchievements(user.id);
        await sendOtpEmail(email, otp);

        return res.json({
            success: true,
            message:
                "✅ Код підтвердження надіслано на пошту. Перевірте пошту та введіть 6 цифр.",
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
        if (!email || !otp)
            return res.status(400).json({ success: false, message: "Введіть email і код" });

        const user = await prisma.user.findFirst({ where: { email, otpCode: otp } });
        if (!user)
            return res.status(400).json({ success: false, message: "❌ Невірний код підтвердження" });

        if (user.otpExpires && new Date() > user.otpExpires)
            return res
                .status(400)
                .json({ success: false, message: "⏰ Код прострочений. Зареєструйтеся знову." });

        await prisma.user.update({
            where: { id: user.id },
            data: { isVerified: true, otpCode: null, otpExpires: null },
        });

        const token = jwt.sign(
            {
                id: user.id,
                role: user.role,
                first_name: user.firstName,
                last_name: user.lastName,
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            message: "✅ Акаунт підтверджено. Вхід виконано.",
            token,
            user: {
                id: user.id,
                first_name: user.firstName,
                last_name: user.lastName,
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
// 🔹 Логін користувача (після підтвердження OTP)
// ======================================================
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user)
            return res.status(400).json({ success: false, message: "Користувача не знайдено" });

        const isValid = await bcrypt.compare(password, user.password || "");
        if (!isValid)
            return res.status(401).json({ success: false, message: "Невірний пароль" });

        if (!user.isVerified)
            return res.status(403).json({
                success: false,
                message: "Будь ласка, підтвердіть пошту за допомогою коду, який ми надіслали.",
            });

        const token = jwt.sign(
            {
                id: user.id,
                role: user.role,
                first_name: user.firstName,
                last_name: user.lastName,
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            message: "Вхід успішний ✅",
            token,
            user: {
                id: user.id,
                first_name: user.firstName,
                last_name: user.lastName,
                email: user.email,
                role: user.role,
                created_at: user.createdAt,
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
            return res
                .status(401)
                .json({ success: false, message: "Немає токена авторизації" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                createdAt: true,
                isVerified: true,
            },
        });

        if (!user)
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });

        res.json({
            success: true,
            user: {
                id: user.id,
                first_name: user.firstName,
                last_name: user.lastName,
                email: user.email,
                role: user.role,
                created_at: user.createdAt,
                is_verified: user.isVerified,
            },
        });
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
            return res
                .status(401)
                .json({ success: false, message: "Немає токена авторизації" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { first_name, last_name, email } = req.body;

        if (!first_name || !last_name || !email)
            return res
                .status(400)
                .json({ success: false, message: "Усі поля обовʼязкові" });

        const user = await prisma.user.update({
            where: { id: decoded.id },
            data: { firstName: first_name, lastName: last_name, email },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                createdAt: true,
                isVerified: true,
            },
        });

        res.json({
            success: true,
            message: "Профіль оновлено ✅",
            user: {
                id: user.id,
                first_name: user.firstName,
                last_name: user.lastName,
                email: user.email,
                role: user.role,
                created_at: user.createdAt,
                is_verified: user.isVerified,
            },
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
            return res
                .status(401)
                .json({ success: false, message: "Немає токена авторизації" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { oldPassword, newPassword } = req.body;
        if (!validatePassword(newPassword)) {
            return res.status(400).json({
                success: false,
                message:
                    "Новий пароль має містити мінімум 6 символів, одну велику літеру, цифру та спеціальний символ",
            });
        }

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { password: true },
        });
        if (!user)
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });

        const isMatch = await bcrypt.compare(oldPassword, user.password || "");
        if (!isMatch)
            return res
                .status(400)
                .json({ success: false, message: "Старий пароль невірний" });

        const hashed = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: decoded.id },
            data: { password: hashed },
        });

        res.json({ success: true, message: "Пароль успішно змінено ✅" });
    } catch (err) {
        console.error("❌ changePassword error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ======================================================
// 🔑 Встановлення пароля після Google-авторизації
// ======================================================
export const setPassword = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token)
            return res
                .status(401)
                .json({ success: false, message: "Немає токена авторизації" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { newPassword } = req.body;

        if (!newPassword)
            if (!validatePassword(newPassword)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Пароль має містити мінімум 6 символів, одну велику літеру, цифру та спеціальний символ",
                });
            }

        return res
                .status(400)
                .json({ success: false, message: "Поле newPassword обов'язкове" });

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true },
        });
        if (!user)
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });

        const hashed = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: decoded.id },
            data: { password: hashed },
        });

        res.json({ success: true, message: "Пароль успішно створено ✅" });
    } catch (err) {
        console.error("❌ setPassword error:", err);
        res.status(500).json({ success: false, message: "Server error" });
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

        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, firstName: true },
        });
        if (!user)
            return res
                .status(404)
                .json({ success: false, message: "Користувача не знайдено" });

        const resetToken = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 15 * 60 * 1000);
        await prisma.user.update({
            where: { id: user.id },
            data: { resetToken, resetExpires: expires },
        });

        const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
        const html = `
      <div style="font-family:system-ui, sans-serif; background:#0d1117; color:#e2e8f0; padding:30px; border-radius:12px; max-width:520px; margin:auto;">
        <h2 style="color:#4ade80; text-align:center;">🔐 Відновлення пароля | CertifyMe</h2>
        <p>Привіт, <b>${user.firstName}</b>!</p>
        <p>Ми отримали запит на зміну пароля до твого акаунта.</p>
        <div style="text-align:center; margin:30px 0;">
          <a href="${resetLink}" style="background:#4ade80;color:#000;padding:12px 26px;text-decoration:none;border-radius:8px;font-weight:600;">🔁 Змінити пароль</a>
        </div>
        <p>Це посилання дійсне протягом <b>15 хвилин</b>.</p>
      </div>`;

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
            if (!validatePassword(newPassword)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Новий пароль має містити мінімум 6 символів, одну велику літеру, цифру та спеціальний символ",
                });
            }

        return res
                .status(400)
                .json({ success: false, message: "Немає токена або нового пароля" });

        const user = await prisma.user.findFirst({
            where: { resetToken: token },
            select: { id: true, resetExpires: true },
        });

        if (!user)
            return res.status(400).json({ success: false, message: "Невірний токен" });
        if (user.resetExpires && new Date() > user.resetExpires)
            return res
                .status(400)
                .json({ success: false, message: "Токен прострочений" });

        const hashed = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashed, resetToken: null, resetExpires: null },
        });

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
        if (!userId || !testId)
            return res.status(400).json({ success: false, message: "Missing data" });

        console.log("💳 FORCED grantUserTest:", { userId, testId });

        await prisma.payment.updateMany({
            where: { userId, testId: Number(testId) },
            data: { status: "succeeded" },
        });

        const paymentExists = await prisma.payment.findFirst({
            where: { userId, testId: Number(testId) },
            select: { id: true },
        });

        if (!paymentExists) {
            await prisma.payment.create({
                data: {
                    userId,
                    testId: Number(testId),
                    amountCents: 1000,
                    currency: "usd",
                    status: "succeeded",
                },
            });
        }

        await prisma.userTest.upsert({
            where: { userId_testId: { userId, testId: Number(testId) } },
            create: { userId, testId: Number(testId), isUnlocked: true },
            update: { isUnlocked: true },
        });

        res.json({ success: true, message: "✅ Payment forced to succeeded, test unlocked" });
    } catch (err) {
        console.error("❌ grantUserTest error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

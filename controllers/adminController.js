import prisma from "../config/prisma.js";

// 🔹 Отримати список усіх користувачів
export const getAllUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                createdAt: true,
            },
            orderBy: { id: "asc" },
        });

        res.json({ success: true, users });
    } catch (err) {
        console.error("❌ getAllUsers error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 🔹 Видалити користувача
export const deleteUser = async (req, res) => {
    try {
        const id = Number(req.params.id);

        // 1️⃣ Перевіряємо, чи існує користувач
        const user = await prisma.user.findUnique({
            where: { id },
            select: { role: true },
        });

        if (!user)
            return res.status(404).json({ success: false, message: "Користувача не знайдено" });

        if (user.role === "admin")
            return res.status(403).json({ success: false, message: "Неможливо видалити адміністратора" });

        // 2️⃣ Починаємо транзакцію
        await prisma.$transaction(async (tx) => {
            await tx.certificate.deleteMany({ where: { userId: id } });
            await tx.userAchievement.deleteMany({ where: { userId: id } });
            // якщо в БД є інші таблиці з userId — додай тут:
            // await tx.review.deleteMany({ where: { userId: id } });

            await tx.user.delete({ where: { id } });
        });

        res.json({ success: true, message: "Користувача успішно видалено ✅" });
    } catch (err) {
        console.error("❌ deleteUser error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 🔹 Отримати всі сертифікати (для адмін-панелі)
export const getAllCertificates = async (req, res) => {
    try {
        const list = await prisma.certificate.findMany({
            select: {
                id: true,
                userId: true,
                testId: true,
                percent: true,
                issued: true,
                expires: true,
                user: {
                    select: {
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
                test: {
                    select: {
                        titleUa: true,
                        titleEn: true,
                    },
                },
            },
            orderBy: { id: "desc" },
        });

        const certificates = list.map((c) => ({
            id: c.id,
            user_id: c.userId,
            test_id: c.testId,
            percent: c.percent,
            issued: c.issued,
            expires: c.expires,
            user_name: `${c.user?.firstName || ""} ${c.user?.lastName || ""}`.trim(),
            user_email: c.user?.email || null,
            test_title_ua: c.test?.titleUa || null,
            test_title_en: c.test?.titleEn || null,
        }));

        res.json({ success: true, certificates });
    } catch (err) {
        console.error("❌ getAllCertificates error:", err);
        res.status(500).json({
            success: false,
            message: "Server error while loading certificates",
        });
    }
};

// 🔹 Видалити сертифікат
export const deleteCertificate = async (req, res) => {
    try {
        const id = Number(req.params.id);
        await prisma.certificate.delete({ where: { id } });
        res.json({ success: true, message: "Certificate deleted" });
    } catch (err) {
        console.error("❌ deleteCertificate error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

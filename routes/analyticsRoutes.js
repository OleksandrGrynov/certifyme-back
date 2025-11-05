import express from "express";
import prisma from "../config/prisma.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

/* ======================================================
   📊 Загальний огляд користувача
   ====================================================== */
router.get("/user/overview", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        // 🧾 Отримуємо всі сертифікати користувача
        const certs = await prisma.certificate.findMany({
            where: { userId },
            select: { percent: true, createdAt: true, testId: true },
        });

        const totalCerts = certs.length;
        const totalTests = totalCerts;
        const uniqueTests = new Set(certs.map((c) => c.testId)).size;

        // 🎯 Середній бал
        const avgScore =
            totalCerts > 0
                ? Math.round(
                    certs.reduce((sum, c) => sum + (c.percent || 0), 0) / totalCerts
                )
                : 0;

        // 🧠 Прохідність (успішно зданих)
        const passed = certs.filter((c) => c.percent >= 60).length;
        const passRate = totalCerts > 0 ? (passed / totalCerts) * 100 : 0;

        // 🔥 Поточний стрік (днів поспіль з активністю)
        const daysActive = [
            ...new Set(certs.map((c) => c.createdAt.toISOString().slice(0, 10))),
        ]
            .sort()
            .reverse();

        let streak = 0;
        if (daysActive.length > 0) {
            let prevDate = new Date(daysActive[0]);
            for (const day of daysActive) {
                const d = new Date(day);
                const diff = Math.floor((prevDate - d) / (1000 * 60 * 60 * 24));
                if (diff === 1 || diff === 0) {
                    streak++;
                    prevDate = d;
                } else break;
            }
        }

        // 🧩 Розрахунок рівня користувача
        const exp =
            totalTests * 10 + totalCerts * 20 + avgScore * 0.5 + streak * 5;
        const level = Math.floor(exp / 100);
        const levelProgress = Math.round(exp % 100);

        // 📤 Відповідь
        res.json({
            success: true,
            data: {
                user_id: userId,
                courses_enrolled: uniqueTests,
                my_tests_taken: totalTests,
                my_avg_score: avgScore,
                my_certificates: totalCerts,
                my_pass_rate: Number(passRate.toFixed(1)), // %
                current_streak_days: streak,
                level, // 🧩 рівень
                level_progress: levelProgress, // 🧩 %
                last_updated: new Date(),
            },
        });
    } catch (err) {
        console.error("❌ user/overview error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});



/* ======================================================
   📆 Активність користувача (щоденна)
   ====================================================== */
router.get("/user/daily", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const days = Number(req.query.days || 30);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const certs = await prisma.certificate.findMany({
            where: { userId, createdAt: { gte: since } },
            select: { createdAt: true },
        });

        const map = new Map();
        for (const c of certs) {
            const date = c.createdAt.toISOString().slice(0, 10);
            map.set(date, (map.get(date) || 0) + 1);
        }

        const data = Array.from(map.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, count]) => ({ date, count }));

        res.json({ success: true, data: { activity: data, tests: data } });
    } catch (err) {
        console.error("❌ user/daily error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* ======================================================
   🧠 Топ-курси користувача
   ====================================================== */
router.get("/user/top-courses", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = Number(req.query.limit || 10);

        const certs = await prisma.certificate.findMany({
            where: { userId },
            include: { test: { select: { titleUa: true } } },
        });

        const map = new Map();
        for (const c of certs) {
            const title = c.test?.titleUa || c.course || "—";
            const key = title.toLowerCase();
            const prev = map.get(key) || { name: title, count: 0, sum: 0 };
            prev.count += 1;
            prev.sum += c.percent || 0;
            map.set(key, prev);
        }

        const data = Array.from(map.values())
            .map((v) => ({
                name: v.name,
                tests_taken: v.count,
                avg_score: Math.round((v.sum / v.count) * 10) / 10,
            }))
            .sort((a, b) => b.tests_taken - a.tests_taken)
            .slice(0, limit);

        res.json({ success: true, data });
    } catch (err) {
        console.error("❌ user/top-courses error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* ======================================================
   🕒 Останні події користувача
   ====================================================== */
router.get("/user/recent", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = Number(req.query.limit || 20);

        const certs = await prisma.certificate.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: { createdAt: true, course: true },
        });

        const data = certs.map((c) => ({
            created_at: c.createdAt,
            type: "certificate",
            description: `Ви отримали сертифікат: ${c.course || "—"}`,
        }));

        res.json({ success: true, data });
    } catch (err) {
        console.error("❌ user/recent error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});
/* ======================================================
   🌍 Публічна статистика для головної сторінки
   ====================================================== */
router.get("/public/overview", async (req, res) => {
    try {
        // Отримуємо базову статистику
        const [users, tests, certificates] = await Promise.all([
            prisma.user.count(),
            prisma.test.count(),
            prisma.certificate.count(),
        ]);

        res.json({
            success: true,
            data: {
                learners: users,
                courses: tests,
                certificates,
                years: 2, // або розрахуй динамічно, наприклад new Date().getFullYear() - 2023
            },
        });
    } catch (err) {
        console.error("❌ public/overview error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});
router.get("/public/stats", async (req, res) => {
    try {
        const [users, tests, certificates] = await Promise.all([
            prisma.user.count(),
            prisma.test.count(),
            prisma.certificate.count(),
        ]);
        res.json({
            success: true,
            data: {
                learners: users,
                courses: tests,
                certificates,
                years: 2,
            },
        });
    } catch (err) {
        console.error("❌ public/stats error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

export default router;

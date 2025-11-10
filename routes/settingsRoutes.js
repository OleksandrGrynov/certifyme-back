import express from "express";
import prisma from "../config/prisma.js";
import { verifyToken, isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();


router.get("/", verifyToken, isAdmin, async (req, res) => {
    try {
        const settings = await prisma.setting.findFirst();
        res.json({ success: true, settings: settings || {} });
    } catch (err) {
        console.error(" getSettings error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

router.put("/", verifyToken, isAdmin, async (req, res) => {
    try {
        const { email_support, telegram, phone } = req.body;

        await prisma.setting.upsert({
            where: { id: 1 },
            update: { emailSupport: email_support, telegram, phone },
            create: {
                id: 1,
                emailSupport: email_support,
                telegram,
                phone,
            },
        });

        res.json({ success: true, message: " Settings updated" });
    } catch (err) {
        console.error(" updateSettings error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});


router.get("/system", verifyToken, isAdmin, async (req, res) => {
    const lang = req.query.lang || "uk";

    
    const info = {
        apiVersion: "1.2.3",
        dbStatus: lang === "en" ? "Connected" : "Підключено",
        uptime: lang === "en" ? "134 hours" : "134 години",
        activeQueries: 5,
    };

    res.json({ success: true, info });
});


router.get("/insights", verifyToken, isAdmin, async (req, res) => {
    const lang = req.query.lang || "uk";

    try {
        
        const [lastTest, usersCount, avgPercent] = await Promise.all([
            prisma.test.findFirst({
                orderBy: { id: "desc" },
                select: { titleUa: true, titleEn: true },
            }),
            prisma.user.count(),
            prisma.certificate.aggregate({ _avg: { percent: true } }),
        ]);

        const avg = Math.round(avgPercent._avg.percent || 0);

        const insights =
            lang === "en"
                ? [
                    `Currently ${usersCount} registered users.`,
                    `Average test completion rate — ${avg}%.`,
                    `Last added test: ${lastTest?.titleEn || lastTest?.titleUa || "N/A"}.`,
                ]
                : [
                    `Наразі ${usersCount} зареєстрованих користувачів.`,
                    `Середній рівень проходження тестів — ${avg}%.`,
                    `Останній доданий тест: ${lastTest?.titleUa || "Невідомо"}.`,
                ];

        res.json({ success: true, insights });
    } catch (err) {
        console.error(" insights error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

export default router;

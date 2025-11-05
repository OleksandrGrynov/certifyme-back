import express from "express";
import prisma from "../config/prisma.js";
import authMiddleware, { isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ======================================================
   📊 Загальний огляд системи
   ====================================================== */
router.get("/analytics/overview", authMiddleware, isAdmin, async (req, res) => {
    try {
        const [
            totalUsers,
            tests,
            certificates,
            avgScore,
            paymentsSucceeded,
            paymentsPending,
            paymentsSum,
        ] = await Promise.all([
            prisma.user.count(),
            prisma.test.count(),
            prisma.certificate.count(),
            prisma.certificate.aggregate({ _avg: { percent: true } }),
            prisma.payment.count({ where: { status: "succeeded" } }),
            prisma.payment.count({ where: { status: "pending" } }),
            prisma.payment.aggregate({ _sum: { amountCents: true } }),
        ]);

        res.json({
            success: true,
            data: {
                total_users: totalUsers,
                tests,
                certificates,
                avg_percent: Number((avgScore._avg.percent || 0).toFixed(1)),
                payments_success: paymentsSucceeded,
                payments_pending: paymentsPending,
                payments_total: Number((paymentsSum._sum.amountCents || 0) / 100),
                last_updated: new Date(),
            },
        });
    } catch (err) {
        console.error("❌ overview error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* ======================================================
   📈 Реєстрації користувачів за днями
   ====================================================== */
router.get("/analytics/daily-users", authMiddleware, isAdmin, async (req, res) => {
    try {
        const days = parseInt(req.query.days || "30", 10);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const users = await prisma.user.findMany({
            where: { createdAt: { gte: since } },
            select: { createdAt: true },
            orderBy: { createdAt: "asc" },
        });

        // emulate GROUP BY date
        const map = new Map();
        for (const u of users) {
            const date = u.createdAt.toISOString().slice(0, 10);
            map.set(date, (map.get(date) || 0) + 1);
        }

        const data = Array.from(map.entries()).map(([date, count]) => ({ date, count }));
        res.json({ success: true, data });
    } catch (err) {
        console.error("❌ daily-users error:", err);
        res.status(500).json({ success: false });
    }
});

/* ======================================================
   💳 Суми платежів за днями
   ====================================================== */
router.get("/analytics/payments-daily", authMiddleware, isAdmin, async (req, res) => {
    try {
        const days = parseInt(req.query.days || "30", 10);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const payments = await prisma.payment.findMany({
            where: { createdAt: { gte: since } },
            select: { createdAt: true, amountCents: true },
            orderBy: { createdAt: "asc" },
        });

        const map = new Map();
        for (const p of payments) {
            const date = p.createdAt.toISOString().slice(0, 10);
            const prev = map.get(date) || { date, total_usd: 0, count: 0 };
            prev.total_usd += (p.amountCents || 0) / 100;
            prev.count += 1;
            map.set(date, prev);
        }

        const data = Array.from(map.values());
        res.json({ success: true, data });
    } catch (err) {
        console.error("❌ payments-daily error:", err);
        res.status(500).json({ success: false });
    }
});

/* ======================================================
   🧠 Найпопулярніші тести
   ====================================================== */
router.get("/analytics/top-tests", authMiddleware, isAdmin, async (req, res) => {
    try {
        const lang = req.query.lang === "en" ? "en" : "ua";

        const certs = await prisma.certificate.findMany({
            include: { test: { select: { titleUa: true, titleEn: true } } },
        });

        const map = new Map();

        for (const c of certs) {
            const title =
                lang === "en"
                    ? c.test?.titleEn || c.courseEn || c.course
                    : c.test?.titleUa || c.course || c.courseEn;

            const key = (title || "—").toLowerCase();
            const prev = map.get(key) || { test: title || "—", count: 0, sum: 0, n: 0 };
            prev.count += 1;
            prev.sum += c.percent || 0;
            prev.n += 1;
            map.set(key, prev);
        }

        const rows = Array.from(map.values())
            .map((v) => ({
                test: v.test,
                count: v.count,
                avg_score: Number(((v.n ? v.sum / v.n : 0)).toFixed(1)),
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("❌ top-tests error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ======================================================
   👑 Користувачі з найбільшими платежами
   ====================================================== */
router.get("/analytics/top-users", authMiddleware, isAdmin, async (req, res) => {
    try {
        const grouped = await prisma.payment.groupBy({
            by: ["userId"],
            where: { status: "succeeded" },
            _count: { userId: true },
            _sum: { amountCents: true },
        });

        const userIds = grouped.map((g) => g.userId);
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
        });

        const userMap = new Map(users.map((u) => [u.id, u]));
        const data = grouped
            .map((g) => ({
                id: g.userId,
                name: `${userMap.get(g.userId)?.firstName || ""} ${userMap.get(g.userId)?.lastName || ""}`.trim(),
                email: userMap.get(g.userId)?.email || "-",
                payments: g._count.userId || 0,
                total_usd: Number((g._sum.amountCents || 0) / 100),
            }))
            .sort((a, b) => b.total_usd - a.total_usd)
            .slice(0, 10);

        res.json({ success: true, data });
    } catch (err) {
        console.error("❌ top-users error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;

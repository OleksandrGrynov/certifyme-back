import express from "express";
import prisma from "../config/prisma.js";
import authMiddleware, { isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ======================================================
   👥 Отримати всіх користувачів
   ====================================================== */
router.get("/users", authMiddleware, isAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { id: "asc" },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });

        const rows = users.map((u) => ({
            id: u.id,
            full_name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim(),
            email: u.email,
            role: u.role,
            created_at: new Date(u.createdAt)
                .toISOString()
                .slice(0, 16)
                .replace("T", " "),
        }));

        res.json({ success: true, users: rows });
    } catch (err) {
        console.error("❌ getAllUsers error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* ======================================================
   🗑️ Видалення користувача з архівацією платежів
   ====================================================== */
router.delete("/users/:id", authMiddleware, isAdmin, async (req, res) => {
    const id = Number(req.params.id);
    try {
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
            },
        });

        if (!user)
            return res
                .status(404)
                .json({ success: false, message: "Користувача не знайдено" });

        if (user.role === "admin")
            return res.status(403).json({
                success: false,
                message: "Неможливо видалити адміністратора",
            });

        await prisma.$transaction(async (tx) => {
            // 💾 архівація платежів
            const payments = await tx.payment.findMany({
                where: { userId: id },
                select: { amountCents: true, createdAt: true },
            });

            if (payments.length) {
                await tx.paymentArchive.createMany({
                    data: payments.map((p) => ({
                        userId: id,
                        userEmail: user.email,
                        userName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
                        amountUsd: (p.amountCents || 0) / 100,
                        createdAt: p.createdAt,
                    })),
                });
            }

            await tx.certificate.deleteMany({ where: { userId: id } });
            await tx.userAchievement.deleteMany({ where: { userId: id } });
            await tx.userTest.deleteMany({ where: { userId: id } });
            await tx.payment.deleteMany({ where: { userId: id } });
            await tx.user.delete({ where: { id } });
        });

        res.json({
            success: true,
            message:
                "Користувача та пов'язані дані видалено, оплати архівовано для аналітики.",
        });
    } catch (err) {
        console.error("❌ deleteUser error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* ======================================================
   ✏️ Змінити роль користувача
   ====================================================== */
router.put("/users/:id", authMiddleware, isAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { role } = req.body;

        const allowedRoles = ["user", "admin"];
        if (!role || !allowedRoles.includes(role)) {
            return res.status(400).json({ success: false, message: "Invalid role" });
        }

        const user = await prisma.user.findUnique({
            where: { id },
            select: { id: true, role: true },
        });
        if (!user)
            return res
                .status(404)
                .json({ success: false, message: "Користувача не знайдено" });

        if (user.role === "admin" && role !== "admin") {
            const adminsCount = await prisma.user.count({ where: { role: "admin" } });
            if (adminsCount <= 1)
                return res.status(400).json({
                    success: false,
                    message: "Неможливо понизити останнього адміністратора",
                });
        }

        const updated = await prisma.user.update({
            where: { id },
            data: { role },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });

        res.json({ success: true, user: updated });
    } catch (err) {
        console.error("❌ updateUserRole error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* ======================================================
   🎓 Отримати всі сертифікати
   ====================================================== */
router.get("/certificates", authMiddleware, isAdmin, async (req, res) => {
    try {
        const certs = await prisma.certificate.findMany({
            orderBy: { issued: "desc" },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
                test: { select: { titleUa: true, titleEn: true } },
            },
        });

        const rows = certs.map((c) => ({
            ...c,
            user: {
                id: c.user?.id || null,
                name:
                    (c.user
                        ? `${c.user.firstName || ""} ${c.user.lastName || ""}`.trim()
                        : c.userName) || c.userName || "-",
                email: c.user?.email || c.userEmail || "-",
            },
            test_title: c.test?.titleUa || c.course,
        }));

        res.json({ success: true, certificates: rows });
    } catch (err) {
        console.error("❌ getAllCertificates error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* ======================================================
   🧾 Видалення сертифікату
   ====================================================== */
router.delete("/certificates/:id", authMiddleware, isAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        await prisma.certificate.delete({ where: { id } });
        res.json({ success: true });
    } catch (err) {
        console.error("❌ deleteCertificate error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* ======================================================
   📊 Глобальна статистика (users/tests/certs/payments)
   ====================================================== */
router.get("/stats", authMiddleware, isAdmin, async (req, res) => {
    try {
        const [
            usersCount,
            testsCount,
            certsCount,
            avgPercentAgg,
            certsByTestRaw,
            usersByMonthRaw,
            paymentsSum,
            paymentsArchiveSum,
        ] = await Promise.all([
            prisma.user.count(),
            prisma.test.count(),
            prisma.certificate.count(),
            prisma.certificate.aggregate({ _avg: { percent: true } }),
            prisma.certificate.findMany({
                include: { test: { select: { titleUa: true } } },
            }),
            prisma.user.findMany({
                where: {
                    createdAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
                },
                select: { createdAt: true },
            }),
            prisma.payment.aggregate({ _sum: { amountCents: true } }),
            prisma.paymentArchive.aggregate({ _sum: { amountUsd: true } }),
        ]);

        const avg_percent = Math.round(avgPercentAgg._avg.percent || 0);

        const certs_by_test_map = new Map();
        for (const c of certsByTestRaw) {
            const title = c.test?.titleUa || c.course;
            certs_by_test_map.set(title, (certs_by_test_map.get(title) || 0) + 1);
        }
        const certs_by_test = Array.from(certs_by_test_map.entries()).map(
            ([test, count]) => ({ test, count })
        );

        const users_by_month_map = new Map();
        for (const u of usersByMonthRaw) {
            const key = u.createdAt.toISOString().slice(0, 7);
            users_by_month_map.set(
                key,
                (users_by_month_map.get(key) || 0) + 1
            );
        }
        const users_by_month = Array.from(users_by_month_map.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([month, count]) => ({ month, count }));

        const totalPaymentsUsd =
            ((paymentsSum._sum.amountCents || 0) / 100 +
                (Number(paymentsArchiveSum._sum.amountUsd) || 0));

        res.json({
            success: true,
            stats: {
                users: usersCount,
                tests: testsCount,
                certificates: certsCount,
                avg_percent,
                payments_total: Number(totalPaymentsUsd.toFixed(2)),
                certs_by_test,
                users_by_month,
            },
        });
    } catch (err) {
        console.error("❌ getStats error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

export default router;

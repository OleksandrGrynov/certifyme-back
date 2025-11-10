import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import prisma from "../config/prisma.js";

const router = express.Router();


router.get("/tests", authMiddleware, async (req, res) => {
    try {
        const tests = await prisma.userTest.findMany({
            where: { userId: req.user.id },
            select: { testId: true },
            orderBy: { grantedAt: "desc" },
        });
        res.json({ testIds: tests.map((t) => t.testId) });
    } catch (err) {
        console.error(" user/tests error:", err);
        res
            .status(500)
            .json({ success: false, message: "Помилка при отриманні тестів" });
    }
});


router.get("/tests/check/:testId", authMiddleware, async (req, res) => {
    try {
        const testId = Number(req.params.testId);
        if (isNaN(testId))
            return res
                .status(400)
                .json({ success: false, message: "Invalid testId" });

        const exists = await prisma.userTest.findUnique({
            where: { userId_testId: { userId: req.user.id, testId } },
            select: { userId: true },
        });

        res.json({ hasAccess: Boolean(exists) });
    } catch (err) {
        console.error(" check access error:", err);
        res.status(500).json({ success: false, hasAccess: false });
    }
});



router.post("/tests/grant", authMiddleware, async (req, res) => {
    try {
        const { testId } = req.body;
        const userId = req.user.id;

        if (!testId) {
            return res
                .status(400)
                .json({ success: false, message: " testId required" });
        }

        const existing = await prisma.userTest.findUnique({
            where: { userId_testId: { userId, testId: Number(testId) } },
        });

        if (existing) {
            
            return res.json({
                success: true,
                message: "⚠️ Access already granted",
                alreadyGranted: true,
            });
        }

        await prisma.userTest.create({
            data: {
                userId,
                testId: Number(testId),
                grantedAt: new Date(),
                isUnlocked: true,
            },
        });

        res.json({ success: true, message: " Access granted successfully" });
    } catch (err) {
        console.error(" grant test access error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

export default router;

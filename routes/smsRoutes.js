import express from "express";
import { verifyToken, isAdmin } from "../middleware/authMiddleware.js";
import prisma from "../config/prisma.js";
import { sendSMS } from "../services/twilioService.js";

const router = express.Router();


function normalizePhone(phone) {
    if (!phone) return null;
    const digits = phone.replace(/[^0-9]/g, "");
    if (!digits) return null;
    return digits.startsWith("380")
        ? `+${digits}`
        : digits.startsWith("+")
            ? digits
            : `+${digits}`;
}


router.get("/check", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const existing = await prisma.smsSubscription.findFirst({
            where: { userId },
        });
        res.json({ subscribed: Boolean(existing) });
    } catch (err) {
        console.error(" Check SMS subscription error:", err);
        res
            .status(500)
            .json({ success: false, message: "Server error while checking" });
    }
});


router.post("/subscribe", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const rawPhone = req.body.phone;
        const phone = normalizePhone(rawPhone);

        if (!phone)
            return res
                .status(400)
                .json({ success: false, message: "Phone required" });

        
        const existing = await prisma.smsSubscription.findFirst({
            where: {
                OR: [{ userId }, { phone }],
            },
        });

        if (existing)
            return res.json({
                success: true,
                message: "Already subscribed",
            });

        await prisma.smsSubscription.create({
            data: { userId, phone },
        });

        res.json({ success: true, message: "Subscription saved" });
    } catch (err) {
        console.error(" Subscribe error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});


router.post("/send-promo", verifyToken, isAdmin, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message?.trim())
            return res.status(400).json({
                success: false,
                message: "Повідомлення не може бути порожнім",
            });

        
        const subs = await prisma.smsSubscription.findMany({
            select: { phone: true },
        });
        if (!subs.length)
            return res.json({
                success: false,
                message: "Немає підписаних користувачів",
            });

        const uniquePhones = [...new Set(subs.map((s) => normalizePhone(s.phone)))];

        let sent = 0;
        let failed = [];

        for (const phone of uniquePhones) {
            const result = await sendSMS(phone, message);
            if (result?.success) sent++;
            else failed.push(phone);
        }

        res.json({
            success: true,
            message: ` Розсилка виконана: ${sent}/${uniquePhones.length} повідомлень`,
            failed: failed.length ? failed : undefined,
        });
    } catch (err) {
        console.error(" sendPromo error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});


router.get("/count", verifyToken, isAdmin, async (req, res) => {
    try {
        const count = await prisma.smsSubscription.count();
        res.json({ success: true, count });
    } catch (err) {
        console.error(" Count error:", err);
        res.status(500).json({ success: false, count: 0 });
    }
});

export default router;

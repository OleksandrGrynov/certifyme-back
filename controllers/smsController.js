import twilio from "twilio";
import prisma from "../config/prisma.js";


const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);


export const sendPromoSMS = async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || message.trim() === "") {
            return res
                .status(400)
                .json({ success: false, message: "Повідомлення не може бути порожнім" });
        }

        
        const subs = await prisma.smsSubscription.findMany({
            select: { phone: true },
        });

        if (!subs.length) {
            return res.json({
                success: false,
                message: "Немає підписаних користувачів",
            });
        }

        let sentCount = 0;

        
        const uniquePhones = [...new Set(subs.map((s) => s.phone))];

        for (const phone of uniquePhones) {
            const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;
            try {
                await client.messages.create({
                    body: message,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: formattedPhone,
                });
                sentCount++;
            } catch (err) {
                console.warn("⚠️ SMS skip for", formattedPhone, err.message);
            }
        }

        res.json({
            success: true,
            message: ` Розсилка виконана: ${sentCount}/${uniquePhones.length} повідомлень`,
        });
    } catch (err) {
        console.error(" sendPromoSMS error:", err);
        res
            .status(500)
            .json({ success: false, message: "Помилка сервера при надсиланні SMS" });
    }
};

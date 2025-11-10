
import Stripe from "stripe";
import prisma from "../config/prisma.js";
import { triggerAchievementsCheck } from "../utils/achievementEngine.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);




export const createCheckoutSession = async (req, res) => {
    try {
        const { testId } = req.body;
        if (!testId) return res.status(400).json({ message: "testId required" });

        if (!req.user?.id)
            return res.status(401).json({ message: "Unauthorized: no user" });

        const userId = req.user.id;

        
        const test = await prisma.test.findUnique({
            where: { id: Number(testId) },
            select: {
                id: true,
                titleUa: true,
                titleEn: true,
                priceCents: true,
                currency: true,
            },
        });

        if (!test) return res.status(404).json({ message: "Test not found" });

        const amount =
            typeof test.priceCents === "number" && test.priceCents > 0
                ? test.priceCents
                : 100;

        
        const payment = await prisma.payment.create({
            data: {
                userId,
                testId: test.id,
                amountCents: amount,
                currency: test.currency || "usd",
                status: "pending",
            },
            select: { id: true },
        });

        console.log("🧾 Creating Stripe session:", {
            userId,
            testId,
            paymentId: payment.id,
            amount,
        });

        
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: test.currency || "usd",
                        unit_amount: amount,
                        product_data: {
                            name: `Access to test: ${test.titleEn || test.titleUa}`,
                        },
                    },
                    quantity: 1,
                },
            ],
            metadata: { userId, testId: test.id, paymentId: payment.id },
            
            success_url: `${process.env.FRONTEND_URL}/tests?paid=true&testId=${testId}`,
            cancel_url: `${process.env.FRONTEND_URL}/tests?paid=false`,
        });

        
        await prisma.payment.update({
            where: { id: payment.id },
            data: { stripeSessionId: session.id },
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error(" createCheckoutSession error:", err);
        res.status(500).json({ message: "Server error" });
    }
};




export const confirmLocalPayment = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { testId } = req.body;

        if (!userId || !testId)
            return res
                .status(400)
                .json({ success: false, message: "Missing data" });

        const numericUserId = Number(userId);
        const numericTestId = Number(testId);

        console.log("🧾 Confirming local payment for", { userId, testId });

        const lastPayment = await prisma.payment.findFirst({
            where: { userId: numericUserId, testId: numericTestId },
            orderBy: { createdAt: "desc" },
        });

        if (!lastPayment) {
            console.log("⚠️ No existing payment found, creating new succeeded record");
            await prisma.payment.create({
                data: {
                    userId: numericUserId,
                    testId: numericTestId,
                    amountCents: 0,
                    currency: "usd",
                    status: "succeeded",
                },
            });
        } else if (lastPayment.status !== "succeeded") {
            await prisma.payment.update({
                where: { id: lastPayment.id },
                data: { status: "succeeded", updatedAt: new Date() },
            });
            console.log(`💰 Updated payment ${lastPayment.id} to succeeded`);
        } else {
            console.log(`⚡ Payment ${lastPayment.id} already succeeded`);
        }

        
        await prisma.userTest.upsert({
            where: {
                userId_testId: { userId: numericUserId, testId: numericTestId },
            },
            create: {
                userId: numericUserId,
                testId: numericTestId,
                isUnlocked: true,
                grantedAt: new Date(),
            },
            update: { isUnlocked: true, grantedAt: new Date() },
        });

        console.log(`🚀 Test ${testId} unlocked for user ${userId}`);

        
        const unlockedAchievements = await triggerAchievementsCheck(numericUserId);

        res.json({
            success: true,
            message: " Payment confirmed, test unlocked, achievements checked",
            unlocked: unlockedAchievements,
        });
    } catch (err) {
        console.error(" confirmLocalPayment error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};




export const stripeWebhook = async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
        
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error(" Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const session = event.data.object;

    try {
        switch (event.type) {
            case "checkout.session.completed": {
                const userId = Number(session.metadata.userId);
                const testId = Number(session.metadata.testId);
                const paymentId = Number(session.metadata.paymentId);

                console.log(" Webhook received for", { userId, testId, paymentId });

                
                await prisma.payment.update({
                    where: { id: paymentId },
                    data: { status: "succeeded", updatedAt: new Date() },
                });

                
                await prisma.userTest.upsert({
                    where: { userId_testId: { userId, testId } },
                    update: { isUnlocked: true, grantedAt: new Date() },
                    create: { userId, testId, isUnlocked: true, grantedAt: new Date() },
                });

                console.log(`🚀 Test ${testId} unlocked for user ${userId}`);

                
                const unlocked = await triggerAchievementsCheck(userId);
                if (unlocked.length > 0)
                    console.log(
                        `🏅 User ${userId} unlocked:`,
                        unlocked.map((a) => a.code)
                    );
                else console.log(`ℹ️ No new achievements for user ${userId}`);
                break;
            }

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });
    } catch (err) {
        console.error("💥 Webhook processing error:", err);
        res.status(500).send("Internal webhook error");
    }
};

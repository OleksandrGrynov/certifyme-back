// controllers/paymentController.js
import Stripe from "stripe";
import { pool } from "../config/db.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ======================================================
// 💳 Створення Stripe Checkout сесії
// ======================================================
export const createCheckoutSession = async (req, res) => {
    try {
        const { testId } = req.body;
        if (!testId)
            return res.status(400).json({ message: "testId required" });

        if (!req.user?.id)
            return res.status(401).json({ message: "Unauthorized: no user" });

        const userId = req.user.id;

        // 🔍 Отримуємо дані тесту
        const testRes = await pool.query(
            "SELECT id, title_ua, title_en, price_cents, currency FROM tests WHERE id=$1",
            [testId]
        );
        const test = testRes.rows[0];
        if (!test)
            return res.status(404).json({ message: "Test not found" });

        const amount = Number(test.price_cents) > 0 ? Number(test.price_cents) : 100;

        // 🧾 Створюємо запис у таблиці payments
        const paymentInsert = await pool.query(
            `INSERT INTO payments (user_id, test_id, amount_cents, currency, status, created_at)
             VALUES ($1, $2, $3, $4, 'pending', NOW())
             RETURNING id`,
            [userId, test.id, amount, test.currency || "usd"]
        );

        const paymentId = paymentInsert.rows[0].id;

        console.log("🧾 Creating Stripe session:", { userId, testId, paymentId, amount });

        // 🪙 Створюємо Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: test.currency || "usd",
                        unit_amount: amount,
                        product_data: {
                            name: `Access to test: ${test.title_en || test.title_ua}`,
                        },
                    },
                    quantity: 1,
                },
            ],
            metadata: { userId, testId, paymentId },
            success_url: `http://localhost:5173/tests?paid=true&testId=${testId}`,
            cancel_url: `http://localhost:5173/tests?paid=false`,
        });

        // 🆔 Зберігаємо ID Stripe-сесії
        await pool.query("UPDATE payments SET stripe_session_id=$1 WHERE id=$2", [
            session.id,
            paymentId,
        ]);

        res.json({ url: session.url });
    } catch (err) {
        console.error("❌ createCheckoutSession error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ======================================================
// 🧠 Локальний режим — без справжнього Stripe webhook
// ======================================================
export const confirmLocalPayment = async (req, res) => {
    try {
        const { userId, testId } = req.body;
        console.log("🧾 Confirming local payment for", { userId, testId });

        if (!userId || !testId)
            return res.status(400).json({ success: false, message: "Missing data" });

        // 🔍 Перевіряємо, чи існує запис платежу
        const paymentRes = await pool.query(
            `SELECT id, status FROM payments 
             WHERE user_id=$1 AND test_id=$2 
             ORDER BY created_at DESC LIMIT 1`,
            [userId, testId]
        );

        if (paymentRes.rows.length === 0) {
            // 💾 Якщо запису немає — створюємо одразу успішний
            await pool.query(
                `INSERT INTO payments (user_id, test_id, amount_cents, currency, status, created_at)
                 VALUES ($1, $2, 200, 'usd', 'succeeded', NOW())`,
                [userId, testId]
            );
            console.log(`💳 Created new succeeded payment for user ${userId}, test ${testId}`);
        } else {
            const payment = paymentRes.rows[0];

            // ✅ Якщо статус ще не "succeeded" — оновлюємо
            if (payment.status !== "succeeded") {
                await pool.query(
                    `UPDATE payments 
                     SET status='succeeded', updated_at=NOW() 
                     WHERE user_id=$1 AND test_id=$2`,
                    [userId, testId]
                );
                console.log(`💰 Updated payment to succeeded for user ${userId}, test ${testId}`);
            } else {
                console.log(`⚡ Payment already succeeded for user ${userId}, test ${testId}`);
            }
        }

        // ✅ Розблоковуємо тест для користувача
        await pool.query(
            `INSERT INTO user_tests (user_id, test_id, is_unlocked)
             VALUES ($1, $2, true)
             ON CONFLICT (user_id, test_id)
             DO UPDATE SET is_unlocked = true`,
            [userId, testId]
        );

        console.log(`🚀 Test ${testId} unlocked for user ${userId}`);
        res.json({
            success: true,
            message: "✅ Payment confirmed and test unlocked",
        });
    } catch (err) {
        console.error("❌ confirmLocalPayment error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ======================================================
// 📴 Вебхук вимкнено локально
// ======================================================
export const stripeWebhook = async (req, res) => {
    res.status(200).json({ message: "Webhook disabled in local mode" });
};

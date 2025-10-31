import Stripe from "stripe";
import { pool } from "../config/db.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 🧾 Створення Stripe Checkout сесії
export const createCheckoutSession = async (req, res) => {
    try {
        const { testId } = req.body;
        if (!testId) return res.status(400).json({ message: "testId required" });

        if (!req.user?.id)
            return res.status(401).json({ message: "Unauthorized: no user" });

        const userId = req.user.id;

        // ✅ Отримуємо дані тесту
        const testRes = await pool.query(
            "SELECT id, title_ua, title_en, price_cents, currency FROM tests WHERE id=$1",
            [testId]
        );
        const test = testRes.rows[0];
        if (!test) return res.status(404).json({ message: "Test not found" });

        const amount = Number(test.price_cents) > 0 ? Number(test.price_cents) : 100;

        // 🧩 Запис у таблицю payments
        const paymentInsert = await pool.query(
            `INSERT INTO payments (user_id, test_id, amount_cents, currency, status)
             VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
            [userId, test.id, amount, test.currency || "usd"]
        );

        const paymentId = paymentInsert.rows[0].id;

        console.log("🧾 Creating Stripe session:", { userId, testId, paymentId, amount });

        // ✅ Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: test.currency || "usd",
                        unit_amount: amount,
                        product_data: { name: `Access to test: ${test.title_en || test.title_ua}` },
                    },
                    quantity: 1,
                },
            ],
            metadata: { userId, testId, paymentId },
            // ⚠️ Прямий редірект на фронт (без вебхука)
            success_url: `http://localhost:5173/tests?paid=true`,
            cancel_url: `http://localhost:5173/tests?paid=false`,
        });

        // 💾 Оновлюємо session_id у БД
        await pool.query(
            "UPDATE payments SET stripe_session_id=$1 WHERE id=$2",
            [session.id, paymentId]
        );

        res.json({ url: session.url });
    } catch (err) {
        console.error("❌ createCheckoutSession error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

/* ❌ Вебхук тимчасово відключено для локальної роботи
   Оплата обробляється на фронті через redirect (?paid=true)
*/
export const stripeWebhook = async (req, res) => {
    res.status(200).json({ message: "Webhook disabled in local mode" });
};

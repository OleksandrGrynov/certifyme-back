import Stripe from "stripe";
import { pool } from "../config/db.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 🧾 Створення Stripe Checkout сесії
export const createCheckoutSession = async (req, res) => {
    try {
        const { testId } = req.body;
        if (!testId) return res.status(400).json({ message: "testId required" });

        // ✅ Отримуємо дані тесту
        const testRes = await pool.query(
            "SELECT id, title_ua, title_en, price_cents, currency FROM tests WHERE id=$1",
            [testId]
        );
        const test = testRes.rows[0];
        if (!test) return res.status(404).json({ message: "Test not found" });

        // fallback назви (англійська або українська)
        const testTitle = test.title_en || test.title_ua || "Test";

        // ✅ мінімальна ціна для Stripe — 50 центів (0.5 USD)
        const amount = test.price_cents > 0 ? test.price_cents : 50;

        // 🧩 створюємо запис у таблиці payments
        const paymentInsert = await pool.query(
            `INSERT INTO payments (user_id, test_id, amount_cents, currency, status)
             VALUES ($1,$2,$3,$4,'pending') RETURNING id`,
            [req.user.id, test.id, amount, test.currency || "usd"]
        );
        const paymentId = paymentInsert.rows[0].id;

        console.log("🧾 Creating Stripe session:", {
            userId: req.user.id,
            testId,
            paymentId
        });

        // 🧾 створюємо Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items: [
                {
                    price_data: {
                        currency: test.currency || "usd",
                        unit_amount: amount,
                        product_data: {
                            name: `Access to test: ${testTitle}`,
                        },
                    },
                    quantity: 1,
                },
            ],
            // ✅ ВАЖЛИВО: Stripe приймає тільки рядкові значення у metadata
            metadata: {
                userId: String(req.user.id),
                testId: String(testId),
                paymentId: String(paymentId),
            },
            success_url: `${process.env.APP_URL}/tests?paid=true`,
            cancel_url: `${process.env.APP_URL}/tests?paid=false`,
        });

        // зберігаємо id сесії Stripe
        await pool.query(
            "UPDATE payments SET stripe_session_id=$1 WHERE id=$2",
            [session.id, paymentId]
        );

        res.json({ url: session.url });
    } catch (err) {
        console.error("❌ Помилка створення сесії:", err);
        res.status(500).json({ message: "Помилка створення сесії", error: err.message });
    }
};

// 🧭 Webhook для підтвердження платежу
export const stripeWebhook = async (req, res) => {
    console.log("⚡ Stripe webhook received");

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers["stripe-signature"];

    try {
        // 1️⃣ Пробуємо розпарсити подію
        const event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );

        console.log("✅ Webhook event type:", event.type);

        // 2️⃣ Обробка події оплати
        if (event.type === "checkout.session.completed") {
            const session = event.data.object;
            console.log("💳 Checkout completed:", session.id);
            console.log("📦 Metadata:", session.metadata);

            const { userId, testId, paymentId } = session.metadata;

            if (!userId || !testId) {
                console.warn("⚠️ Missing metadata:", session.metadata);
                return res.status(400).json({ message: "Missing metadata" });
            }

            // Оновлюємо статус платежу
            await pool.query(
                `UPDATE payments
                 SET status='succeeded', stripe_payment_intent=$1
                 WHERE id=$2`,
                [session.payment_intent || null, paymentId]
            );

            // Додаємо доступ користувачу
            await pool.query(
                `INSERT INTO user_tests (user_id, test_id, granted_at)
                 VALUES ($1, $2, NOW())
                     ON CONFLICT (user_id, test_id) DO NOTHING`,
                [userId, testId]
            );

            console.log(`🎉 Access granted → user_id=${userId}, test_id=${testId}`);
        }

        // 3️⃣ Відповідь Stripe
        res.json({ received: true });
    } catch (err) {
        console.error("❌ Webhook error:", err.message);
        console.error("🧩 Raw body length:", req.body?.length || 0);
        console.error(
            "🔑 Stripe secret used:",
            process.env.STRIPE_WEBHOOK_SECRET?.slice(0, 12) + "..."
        );
        res.status(400).send(`Webhook Error: ${err.message}`);
    }
};

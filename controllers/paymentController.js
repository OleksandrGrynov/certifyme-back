import Stripe from "stripe";
import { pool } from "../config/db.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 🧾 Створення Stripe Checkout сесії
export const createCheckoutSession = async (req, res) => {
    try {
        const { testId } = req.body;
        if (!testId) return res.status(400).json({ message: "testId required" });

        // 🔹 Якщо немає авторизації (тимчасово для дебагу)
        const userId = req.user?.id || 1; // TODO: замінити 1 на реальний user_id після тестів

        // ✅ Отримуємо дані тесту
        const testRes = await pool.query(
            "SELECT id, title_ua, title_en, price_cents, currency FROM tests WHERE id=$1",
            [testId]
        );
        const test = testRes.rows[0];
        if (!test) return res.status(404).json({ message: "Test not found" });

        const testTitle = test.title_en || test.title_ua || "Test";
        const amount = Number(test.price_cents) > 0 ? Number(test.price_cents) : 100;

        // 🧩 Створюємо запис у таблиці payments
        const paymentInsert = await pool.query(
            `INSERT INTO payments (user_id, test_id, amount_cents, currency, status)
             VALUES ($1,$2,$3,$4,'pending') RETURNING id`,
            [userId, test.id, amount, test.currency || "usd"]
        );
        const paymentId = paymentInsert.rows[0].id;

        console.log("🧾 Creating Stripe session:", { userId, testId, paymentId, amount });

        // ✅ Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            mode: "payment",

            // ✅ підтримується у всіх версіях
            payment_method_types: ["card"],

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

            metadata: {
                userId: String(userId),
                testId: String(testId),
                paymentId: String(paymentId),
            },

            payment_intent_data: {
                metadata: {
                    userId: String(userId),
                    testId: String(testId),
                    paymentId: String(paymentId),
                },
            },

            client_reference_id: `${userId}-${testId}-${paymentId}`,
            success_url: `${process.env.APP_URL}/tests?paid=true`,
            cancel_url: `${process.env.APP_URL}/tests?paid=false`,
        });


        // 💾 Оновлюємо session_id у БД
        await pool.query(
            "UPDATE payments SET stripe_session_id=$1 WHERE id=$2",
            [session.id, paymentId]
        );

        res.json({ url: session.url });
    } catch (err) {
        console.error("❌ Помилка створення сесії:", {
            message: err.message,
            stack: err.stack,
        });
        res.status(500).json({
            message: "Помилка створення сесії",
            error: err.message,
        });
    }
};

// 🧭 Webhook для підтвердження платежу
export const stripeWebhook = async (req, res) => {
    console.log("⚡ Stripe webhook received");

    const sig = req.headers["stripe-signature"];
    try {
        const event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );

        console.log("✅ Webhook event type:", event.type);

        if (event.type === "checkout.session.completed") {
            const session = event.data.object;

            // 🔹 1. Пробуємо metadata
            let metadata = session.metadata || {};

            // 🔹 2. Якщо порожнє — пробуємо з payment_intent
            if ((!metadata || Object.keys(metadata).length === 0) && session.payment_intent) {
                const intent = await stripe.paymentIntents.retrieve(session.payment_intent);
                metadata = intent.metadata || {};
                console.log("📦 Retrieved metadata from payment_intent:", metadata);
            }

            // 🔹 3. Якщо все ще порожнє — парсимо client_reference_id
            if ((!metadata || Object.keys(metadata).length === 0) && session.client_reference_id) {
                const parts = session.client_reference_id.split("-");
                if (parts.length === 3) {
                    metadata = {
                        userId: parts[0],
                        testId: parts[1],
                        paymentId: parts[2],
                    };
                    console.log("🔍 Parsed from client_reference_id:", metadata);
                }
            }

            const { userId, testId, paymentId } = metadata;
            if (!userId || !testId) {
                console.warn("⚠️ Missing metadata after all attempts:", metadata);
                return res.status(400).json({ message: "Missing metadata" });
            }

            // 🔹 4. Оновлюємо статус платежу
            await pool.query(
                `UPDATE payments
                 SET status='succeeded', stripe_payment_intent=$1
                 WHERE id=$2`,
                [session.payment_intent || null, paymentId]
            );

            // 🔹 5. Додаємо доступ користувачу
            await pool.query(
                `INSERT INTO user_tests (user_id, test_id, granted_at)
                 VALUES ($1, $2, NOW())
                     ON CONFLICT (user_id, test_id) DO NOTHING`,
                [userId, testId]
            );

            console.log(`🎉 Access granted → user_id=${userId}, test_id=${testId}`);
        }

        res.json({ received: true });
    } catch (err) {
        console.error("❌ Webhook error:", { message: err.message, stack: err.stack });
        res.status(400).send(`Webhook Error: ${err.message}`);
    }
};

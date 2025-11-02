import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendTestEmail() {
    try {
        const data = await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to: "alex170707228@gmail.com",
            subject: "✅ Перевірка Resend",
            html: "<p>Привіт! Це тестовий лист від CertifyMe 💚</p>",
        });

        console.log("✅ Лист успішно відправлено:", data);
    } catch (error) {
        console.error("❌ Помилка відправки:", error);
    }
}

sendTestEmail();

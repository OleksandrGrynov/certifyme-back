import twilio from "twilio";
import dotenv from "dotenv";
dotenv.config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function sendSMS(to, body) {
    try {
        const message = await client.messages.create({
            body,
            from: process.env.TWILIO_PHONE_NUMBER,
            to,
        });
        console.log("✅ SMS sent:", message.sid);
        return { success: true };
    } catch (err) {
        console.error("❌ SMS error:", err.message);
        return { success: false, error: err.message };
    }
}

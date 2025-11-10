import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();


const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);


export async function sendSMS(to, body) {
    try {
        if (!to || !body)
            throw new Error("Missing phone number or message body");

        const message = await client.messages.create({
            body,
            from: process.env.TWILIO_PHONE_NUMBER, 
            to,
        });

        console.log(` SMS sent to ${to}: ${message.sid}`);
        return { success: true };
    } catch (err) {
        console.error(` Failed to send SMS to ${to}:`, err.message);
        return { success: false, error: err.message };
    }
}

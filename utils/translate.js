import pkg from "@vitalets/google-translate-api";
const { translate } = pkg;

export async function translateText(text, to = "en") {
    if (!text) return "";
    try {
        const res = await translate(text, { to });
        return res.text;
    } catch (err) {
        console.error("⚠️ Translation error:", err.message);
        return text; // fallback, якщо переклад не вдався
    }
}

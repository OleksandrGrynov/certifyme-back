import translate from "@vitalets/google-translate-api";

export async function translateText(text, to = "en") {
    try {
        const res = await translate(text, { to });
        return res.text;
    } catch (err) {
        console.error("⚠️ Translation error:", err.message);
        return text; // fallback
    }
}

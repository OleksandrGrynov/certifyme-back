import OpenAI from "openai";
import dotenv from "dotenv";
import axios from "axios";
import prisma from "../config/prisma.js"; 
dotenv.config();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


async function translateText(text, from = "uk", to = "en") {
    if (!text || !text.trim()) return text;
    try {
        const response = await axios.get("https://translate.googleapis.com/translate_a/single", {
            params: {
                client: "gtx",
                sl: from,
                tl: to,
                dt: "t",
                q: text,
            },
            timeout: 10000,
        });
        const translated = response.data?.[0]?.map((a) => a[0]).join(" ");
        return translated || text;
    } catch (err) {
        console.error(" translateText error:", err.message);
        return text;
    }
}


export const explainOneQuestion = async (req, res) => {
    try {
        const { question, options, correct, userAnswer } = req.body;

        if (!question || !options || !correct) {
            return res.status(400).json({
                success: false,
                message: " Не передано дані питання",
            });
        }

        
        const existing = await prisma.explanation.findFirst({
            where: { questionTextUa: question.trim() },
            select: { explanationUa: true, explanationEn: true },
        });

        if (existing) {
            console.log(" Взято з БД (кеш)");
            return res.json({
                success: true,
                explanation_ua: existing.explanationUa,
                explanation_en: existing.explanationEn,
                cached: true,
            });
        }

        
        const prompt = `
Ти — досвідчений викладач програмування.
Поясни коротко українською мовою:
1️⃣ чому правильна відповідь правильна;
2️⃣ чому інші варіанти неправильні;
3️⃣ якщо користувач помилився — порадь, як запам’ятати правильну.

Питання: ${question}
Варіанти: ${options.join(", ")}
Правильна відповідь: ${correct}
Відповідь користувача: ${userAnswer || "—"}
    `;

        const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.6,
            max_tokens: 500,
        });

        const explanationUa = completion.choices[0]?.message?.content?.trim() || "Немає відповіді";
        const explanationEn = await translateText(explanationUa, "uk", "en");
        const questionEn = await translateText(question, "uk", "en");

        
        await prisma.explanation.create({
            data: {
                questionTextUa: question.trim(),
                questionTextEn: questionEn,
                explanationUa: explanationUa,
                explanationEn: explanationEn,
            },
        });

        console.log("💾 Збережено нове пояснення у базі");

        res.json({
            success: true,
            explanation_ua: explanationUa,
            explanation_en: explanationEn,
            cached: false,
        });
    } catch (err) {
        console.error(" explainOneQuestion error:", err);
        res.status(500).json({
            success: false,
            message: " Не вдалося отримати пояснення. Перевір ключ або баланс.",
        });
    }
};

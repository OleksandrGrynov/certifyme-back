import { PrismaClient } from "@prisma/client";
import { translateText } from "../utils/translate.js"; 

const prisma = new PrismaClient();


export async function createAchievement(req, res) {
    try {
        const {
            title_ua,
            description_ua,
            image_url,
            category,
            icon,
            condition_type, 
            condition_value, 
        } = req.body;

        if (!title_ua) {
            return res.status(400).json({
                success: false,
                message: "Назва (title_ua) обов’язкова",
            });
        }

        
        const code =
            req.body.code ||
            title_ua.toLowerCase().replace(/\s+/g, "_").replace(/[^\w_]/g, "") +
            "_" +
            Date.now();

        
        const title_en = await translateText(title_ua, "en");
        const description_en = description_ua
            ? await translateText(description_ua, "en")
            : "";

        
        const achievement = await prisma.achievement.create({
            data: {
                code,
                titleUa: title_ua,
                titleEn: title_en,
                descriptionUa: description_ua,
                descriptionEn: description_en,
                imageUrl: image_url,
                category,
                icon,
                conditionType: condition_type || null,
                conditionValue: condition_value ? Number(condition_value) : null,
            },
        });

        res.json({ success: true, achievement });
    } catch (err) {
        console.error(" createAchievement error:", err);
        res
            .status(500)
            .json({ success: false, message: "Server error: " + err.message });
    }
}


export async function updateAchievement(req, res) {
    try {
        const { id } = req.params;
        const {
            title_ua,
            description_ua,
            image_url,
            category,
            icon,
            condition_type,
            condition_value,
        } = req.body;

        
        const title_en = title_ua ? await translateText(title_ua, "en") : undefined;
        const description_en = description_ua
            ? await translateText(description_ua, "en")
            : undefined;

        const achievement = await prisma.achievement.update({
            where: { id: Number(id) },
            data: {
                titleUa: title_ua,
                titleEn: title_en,
                descriptionUa: description_ua,
                descriptionEn: description_en,
                imageUrl: image_url,
                category,
                icon,
                conditionType: condition_type || null,
                conditionValue: condition_value ? Number(condition_value) : null,
            },
        });

        res.json({ success: true, achievement });
    } catch (err) {
        console.error(" updateAchievement error:", err);
        res
            .status(500)
            .json({ success: false, message: "Server error: " + err.message });
    }
}


export async function deleteAchievement(req, res) {
    try {
        const { id } = req.params;
        await prisma.achievement.delete({ where: { id: Number(id) } });
        res.json({ success: true });
    } catch (err) {
        console.error(" deleteAchievement error:", err);
        res
            .status(500)
            .json({ success: false, message: "Server error: " + err.message });
    }
}


export async function getAllAchievements(req, res) {
    try {
        const achievements = await prisma.achievement.findMany({
            orderBy: [{ category: "asc" }, { id: "asc" }],
        });
        res.json({ success: true, achievements });
    } catch (err) {
        console.error(" getAllAchievements error:", err);
        res
            .status(500)
            .json({ success: false, message: "Server error: " + err.message });
    }
}

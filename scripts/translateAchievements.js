import { PrismaClient } from "@prisma/client";
import pkg from "@vitalets/google-translate-api";
const { translate } = pkg;

const prisma = new PrismaClient();

async function translateMissing() {
    const list = await prisma.achievement.findMany();

    for (const a of list) {
        if (!a.titleEn && a.titleUa) {
            try {
                const titleEn = (await translate(a.titleUa, { to: "en" })).text;
                const descriptionEn = a.descriptionUa
                    ? (await translate(a.descriptionUa, { to: "en" })).text
                    : null;

                await prisma.achievement.update({
                    where: { id: a.id },
                    data: { titleEn, descriptionEn },
                });

                console.log(`✅ ${a.titleUa} → ${titleEn}`);
            } catch (err) {
                console.error(`❌ Error translating ID ${a.id}:`, err.message);
            }
        }
    }

    console.log("🎉 Done!");
    await prisma.$disconnect();
}

translateMissing();

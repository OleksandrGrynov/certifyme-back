//userTestController.js
import prisma from "../config/prisma.js";
import { generateCertificatePDF } from "../utils/certificateGenerator.js";
// ======================================================
// ✅ Всі тести користувача (повна відповідність старій логіці)
// ======================================================
export const getUserTests = async (req, res) => {
    try {
        const { id: userId } = req.user;

        // Prisma еквівалент: SELECT test_id FROM user_tests WHERE user_id = $1 ORDER BY granted_at DESC
        const tests = await prisma.userTest.findMany({
            where: { userId },
            select: { testId: true },
            orderBy: { grantedAt: "desc" },
        });

        // Повністю зберігаємо структуру відповіді старої логіки
        const testIds = tests.map((t) => t.testId);
        res.json({ testIds });
    } catch (err) {
        console.error("❌ getUserTests error:", err);
        res.status(500).json({ message: "Database error" });
    }
};

// ======================================================
// ✅ Перевірка доступу до одного тесту (1:1 із SQL-версією)
// ======================================================
export const checkUserTestAccess = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const { testId } = req.params;

        const record = await prisma.userTest.findUnique({
            where: {
                userId_testId: {
                    userId,
                    testId: Number(testId),
                },
            },
            select: { userId: true },
        });

        res.json({ hasAccess: !!record });
    } catch (err) {
        console.error("❌ checkUserTestAccess error:", err);
        res.status(500).json({ message: "Database error" });
    }
};
const certificate = await prisma.certificate.create({
    data: {
        userId,
        testId,
        percent: score,
        issued: new Date(),
        expires: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
        certId: `C-UA-${Math.floor(100000 + Math.random() * 900000)}`, // генеруєш ID одразу
    },
});

// ✅ тільки після збереження — генеруєш PDF
try {
    await generateCertificatePDF(certificate.certId);
    console.log(`📜 Сертифікат PDF створено: ${certificate.certId}`);
} catch (err) {
    console.error("❌ Помилка генерації PDF:", err);
}
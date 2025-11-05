import express from "express";
import path from "path";
import fs from "fs";
import prisma from "../config/prisma.js";
import { generateCertificatePDF } from "../utils/certificateGenerator.js";

const router = express.Router();

/* ────────────────────────────────────────────────
 * 1️⃣  Віддає або генерує PDF сертифікат
 * ────────────────────────────────────────────────*/
router.get("/:filename", async (req, res) => {
    try {
        const filename = req.params.filename;
        const certPath = path.join("certificates", filename);

        // Якщо PDF уже існує — просто віддаємо файл
        if (fs.existsSync(certPath)) {
            return res.sendFile(path.resolve(certPath));
        }

        // Інакше — пробуємо знайти сертифікат у БД
        const certId = filename.replace("certificate_", "").replace(".pdf", "");
        console.log(`📜 Сертифікат ${certId} не знайдено — перевіряємо в БД...`);

        const certificate = await prisma.certificate.findUnique({
            where: { certId },
        });

        if (!certificate) {
            return res
                .status(404)
                .json({ success: false, message: "Certificate not found" });
        }

        // Генеруємо PDF заново
        const resultPath = await generateCertificatePDF(certId);
        return res.sendFile(path.resolve(resultPath));
    } catch (err) {
        console.error("❌ Error serving certificate:", err);
        res.status(500).json({ message: "Error loading certificate" });
    }
});

/* ────────────────────────────────────────────────
 * 2️⃣  Оновлення дати закінчення дії сертифіката
 * ────────────────────────────────────────────────*/
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params; // це `id` або `certId`
        const { expires } = req.body;

        if (!expires) {
            return res
                .status(400)
                .json({ success: false, message: "Missing 'expires' field" });
        }

        // Можемо оновлювати по id або по certId — перевіримо обидва варіанти
        const certificate = await prisma.certificate.updateMany({
            where: {
                OR: [
                    { id: Number(id) },
                    { certId: id },
                ],
            },
            data: { expires: new Date(expires) },
        });

        if (certificate.count === 0) {
            return res
                .status(404)
                .json({ success: false, message: "Certificate not found" });
        }

        res.json({
            success: true,
            message: "✅ Certificate expiration updated successfully",
        });
    } catch (err) {
        console.error("❌ Error updating certificate date:", err);
        res
            .status(500)
            .json({ success: false, message: "Server error while updating" });
    }
});

export default router;

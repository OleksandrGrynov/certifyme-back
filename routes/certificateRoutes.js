import express from "express";
import path from "path";
import fs from "fs";
import prisma from "../config/prisma.js";
import { generateCertificatePDF } from "../utils/certificateGenerator.js";

const router = express.Router();


router.get("/:filename", async (req, res) => {
    try {
        const filename = req.params.filename;
        const certPath = path.join("certificates", filename);

        
        if (fs.existsSync(certPath)) {
            return res.sendFile(path.resolve(certPath));
        }

        
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

        
        const resultPath = await generateCertificatePDF(certId);
        return res.sendFile(path.resolve(resultPath));
    } catch (err) {
        console.error(" Error serving certificate:", err);
        res.status(500).json({ message: "Error loading certificate" });
    }
});


router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params; 
        const { expires } = req.body;

        if (!expires) {
            return res
                .status(400)
                .json({ success: false, message: "Missing 'expires' field" });
        }

        
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
            message: " Certificate expiration updated successfully",
        });
    } catch (err) {
        console.error(" Error updating certificate date:", err);
        res
            .status(500)
            .json({ success: false, message: "Server error while updating" });
    }
});

export default router;

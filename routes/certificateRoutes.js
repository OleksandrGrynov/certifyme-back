// routes/certificateRoutes.js
import express from "express";
import path from "path";
import fs from "fs";
import { generateCertificatePDF } from "../utils/certificateGenerator.js";

const router = express.Router();

// Повертає або генерує сертифікат, якщо не існує
router.get("/:filename", async (req, res) => {
    try {
        const filename = req.params.filename;
        const certPath = path.join("certificates", filename);

        // Якщо сертифікат вже існує — просто віддаємо
        if (fs.existsSync(certPath)) {
            return res.sendFile(path.resolve(certPath));
        }

        // Інакше генеруємо новий PDF
        const id = filename.replace("certificate_", "").replace(".pdf", "");
        console.log(`📜 Сертифікат ${id} не знайдено — генеруємо заново...`);

        const resultPath = await generateCertificatePDF(id); // створює та повертає шлях
        return res.sendFile(path.resolve(resultPath));
    } catch (err) {
        console.error("❌ Error serving certificate:", err);
        res.status(500).json({ message: "Error loading certificate" });
    }
});

export default router;

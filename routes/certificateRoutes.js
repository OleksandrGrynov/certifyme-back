// routes/certificateRoutes.js
import express from "express";
import path from "path";
import fs from "fs";
import { pool } from "../config/db.js"; // ✅ іменований імпорт!
import { generateCertificatePDF } from "../utils/certificateGenerator.js";

const router = express.Router();

/* ────────────────────────────────────────────────
 * 1️⃣  Віддає або генерує PDF сертифікат
 * ────────────────────────────────────────────────*/
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

        const resultPath = await generateCertificatePDF(id);
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
        const { id } = req.params;
        const { expires } = req.body;

        if (!expires) {
            return res
                .status(400)
                .json({ success: false, message: "Missing 'expires' field" });
        }

        const result = await pool.query(
            "UPDATE certificates SET expires = $1 WHERE id = $2 RETURNING *",
            [expires, id]
        );

        if (result.rowCount === 0) {
            return res
                .status(404)
                .json({ success: false, message: "Certificate not found" });
        }

        res.json({
            success: true,
            message: "Certificate expiration updated successfully",
            certificate: result.rows[0],
        });
    } catch (err) {
        console.error("❌ Error updating certificate date:", err);
        res
            .status(500)
            .json({ success: false, message: "Server error while updating" });
    }
});

export default router;

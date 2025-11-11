import express from "express";
import path from "path";
import fs from "fs";
import { verify, createPublicKey } from "crypto"; // ✅ правильний імпорт
import prisma from "../config/prisma.js";
import { generateCertificatePDF } from "../utils/certificateGenerator.js";

const router = express.Router();

/* ======================================================
   ✅ Перевірка цифрового підпису сертифіката
   ====================================================== */
router.get("/verify/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const cert = await prisma.certificate.findUnique({ where: { certId: id } });
        if (!cert)
            return res
                .status(404)
                .json({ success: false, message: "Certificate not found" });

        // ✅ зчитуємо публічний ключ і створюємо об’єкт ключа
        const publicKeyPem = fs.readFileSync("keys/public.pem", "utf8");
        const publicKey = createPublicKey(publicKeyPem);

        const data = JSON.stringify({
            certId: cert.certId,
            userName: cert.userName,
            course: cert.course,
            score: cert.percent,
            issued: cert.issued,
            expires: cert.expires,
        });

        // ✅ перевірка підпису
        const isValid = verify(
            "sha256",
            Buffer.from(data),
            publicKey,
            Buffer.from(cert.signature || "", "base64")
        );

        res.json({
            success: true,
            valid: isValid,
            certId: cert.certId,
            name: cert.userName,
            course: cert.course,
            issued: new Date(cert.issued).toLocaleDateString("uk-UA"),
            expires: new Date(cert.expires).toLocaleDateString("uk-UA"),
            percent: cert.percent,
            status: isValid
                ? "✅ Сертифікат справжній"
                : "❌ Сертифікат змінено або недійсний",
        });
    } catch (err) {
        console.error("Verification error:", err);
        res
            .status(500)
            .json({ success: false, message: "Verification failed", error: err.message });
    }
});

/* ======================================================
   🧾 Отримання PDF сертифіката
   ====================================================== */
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
        console.error("Error serving certificate:", err);
        res.status(500).json({ message: "Error loading certificate" });
    }
});

/* ======================================================
   🕒 Оновлення дати дії сертифіката
   ====================================================== */
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
                OR: [{ id: Number(id) }, { certId: id }],
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
            message: "Certificate expiration updated successfully",
        });
    } catch (err) {
        console.error("Error updating certificate date:", err);
        res
            .status(500)
            .json({ success: false, message: "Server error while updating" });
    }
});

export default router;

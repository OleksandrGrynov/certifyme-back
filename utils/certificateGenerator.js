import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { pool } from "../config/db.js";

export async function generateCertificatePDF(certId) {
    const certFolder = path.join(process.cwd(), "certificates");
    if (!fs.existsSync(certFolder)) fs.mkdirSync(certFolder);

    const certFile = path.join(certFolder, `certificate_${certId}.pdf`);

    // 🔹 Якщо вже існує, повертаємо одразу
    if (fs.existsSync(certFile)) return certFile;

    // Отримуємо дані з БД
    const { rows } = await pool.query(
        `SELECT c.*, u.name AS user_name, u.surname AS user_surname, t.title_ua, t.title_en 
         FROM certificates c
         JOIN users u ON c.user_id = u.id
         JOIN tests t ON c.test_id = t.id
         WHERE c.certificate_code = $1`,
        [certId]
    );

    if (!rows.length) throw new Error("Certificate not found in DB");
    const cert = rows[0];

    // Генерація PDF
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(fs.createWriteStream(certFile));

    doc.fontSize(24).fillColor("#16a34a").text("CERTIFYME", { align: "center" });
    doc.moveDown();
    doc.fontSize(18).fillColor("#000").text(`Сертифікат / Certificate`, { align: "center" });
    doc.moveDown(2);
    doc.fontSize(16).text(`Видано: ${cert.user_name} ${cert.user_surname}`, { align: "center" });
    doc.text(`Тест: ${cert.title_ua || cert.title_en}`, { align: "center" });
    doc.text(`Результат: ${cert.score || 0}%`, { align: "center" });
    doc.text(`Дата видачі: ${new Date(cert.issued_at).toLocaleDateString("uk-UA")}`, { align: "center" });
    doc.text(`Діє до: ${new Date(cert.expires_at).toLocaleDateString("uk-UA")}`, { align: "center" });

    doc.moveDown(2);
    doc.fontSize(12).text(`ID: ${cert.certificate_code}`, { align: "center" });
    doc.moveDown();
    doc.text("CertifyMe © 2025", { align: "center", opacity: 0.7 });

    doc.end();

    console.log(`✅ Certificate regenerated: ${certFile}`);
    return certFile;
}

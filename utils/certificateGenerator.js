import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import prisma from "../config/prisma.js";

const FONT_PATH = path.join(process.cwd(), "fonts", "OpenSans-Regular.ttf");
const FONT_BOLD = path.join(process.cwd(), "fonts", "OpenSans-Bold.ttf");

export async function generateCertificatePDF(certId) {
    const certFolder = path.resolve("certificates");
    if (!fs.existsSync(certFolder)) fs.mkdirSync(certFolder, { recursive: true });

    const certFile = path.join(certFolder, `certificate_${certId}.pdf`);
    const cert = await prisma.certificate.findFirst({
        where: { certId: String(certId) },
        include: {
            user: { select: { firstName: true, lastName: true } },
            test: { select: { titleUa: true, titleEn: true } },
        },
    });

    if (!cert) throw new Error("❌ Certificate not found in DB");

    const userName = `${cert.user?.firstName || ""} ${cert.user?.lastName || ""}`.trim();
    const testTitle = cert.test?.titleUa || cert.test?.titleEn || "-";
    const score = cert.percent ?? 0;
    const issuedAt = new Date(cert.issued).toLocaleDateString("uk-UA");
    const expiresAt = new Date(cert.expires).toLocaleDateString("uk-UA");
    const certCode = cert.certId;

    // 🔗 QR
    const verifyUrl = `https://certifyme.me/verify/${certCode}`;
    const qrPath = path.join(certFolder, `qr_${certCode}.png`);
    await QRCode.toFile(qrPath, verifyUrl, {
        width: 110,
        color: { dark: "#00703C", light: "#FFFFFF" },
    });

    // 🧾 PDF
    const doc = new PDFDocument({
        size: "A4",
        margin: 60,
        info: { Title: `Certificate ${certCode}`, Author: "CertifyMe" },
    });
    doc.pipe(fs.createWriteStream(certFile));

    if (fs.existsSync(FONT_PATH)) doc.registerFont("OpenSans", FONT_PATH);
    if (fs.existsSync(FONT_BOLD)) doc.registerFont("OpenSans-Bold", FONT_BOLD);

    // Рамка
    doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40)
        .strokeColor("#16a34a").lineWidth(3).stroke();

    // HEADER
    doc.font("OpenSans-Bold").fontSize(28).fillColor("#16a34a")
        .text("CERTIFYME", { align: "center" });
    doc.moveDown(0.3);
    doc.font("OpenSans").fontSize(16).fillColor("#000")
        .text("СЕРТИФІКАТ ДОСЯГНЕНЬ / CERTIFICATE OF COMPLETION", { align: "center" });

    // Основна частина (ліво-право)
    const leftX = 80;
    const rightX = 390; // 🔧 більше відступу
    let y = 180;

    doc.fontSize(14).fillColor("#333").text("Видано / Awarded to:", leftX, y);
    y += 25;
    doc.font("OpenSans-Bold").fontSize(26).fillColor("#000").text(userName, leftX, y);
    y += 40;
    doc.font("OpenSans").fontSize(14).fillColor("#333")
        .text("За успішне проходження тесту / For successfully completing the test:", leftX, y, { width: 260 });
    y += 40;
    doc.font("OpenSans-Bold").fontSize(18).fillColor("#000").text(testTitle, leftX, y);
    y += 35;
    doc.font("OpenSans").fontSize(14).fillColor("#000")
        .text(`Результат / Score: ${score}%`, leftX, y);
    y += 35;
    doc.fontSize(12).fillColor("#444")
        .text(`Дата видачі / Issued: ${issuedAt}`, leftX, y)
        .text(`Дійсний до / Valid until: ${expiresAt}`, leftX, y + 15);

    // QR + ID
    if (fs.existsSync(qrPath)) doc.image(qrPath, rightX, 240, { width: 110 });
    doc.fontSize(10).fillColor("#555").text(`ID: ${certCode}`, rightX + 10, 365);
    doc.fontSize(9).fillColor("#888").text("CertifyMe © 2025 | certifyme.me", rightX, 380);

    // Нижній блок
    const assetsDir = path.join(process.cwd(), "assets");
    const signPath = path.join(assetsDir, "signature.png");
    const stampPath = path.join(assetsDir, "stamp.png");
    const logoPath = path.join(assetsDir, "logo.png");
    const baseY = 660;

    // Підпис зліва
    if (fs.existsSync(signPath)) doc.image(signPath, leftX + 10, baseY - 15, { width: 90 });
    doc.font("OpenSans").fontSize(12).fillColor("#333")
        .text("_________________________", leftX, baseY + 50)
        .text("CEO, CertifyMe Platform", leftX + 10, baseY + 65);

    // Печатка справа
    if (fs.existsSync(stampPath)) doc.image(stampPath, rightX + 20, baseY - 30, { width: 100 });
    doc.fontSize(11).fillColor("#333").text("Печатка / Stamp", rightX + 35, baseY + 65);

    // Логотип по центру трохи вище
    if (fs.existsSync(logoPath)) {
        // було doc.page.height - 85 → тепер -70
        doc.image(logoPath, doc.page.width / 2 - 25, doc.page.height - 130, { width: 50 });
    }


    doc.end();
    await new Promise((r) => setTimeout(r, 200));

    console.log(`✅ Elegant and aligned certificate created: ${certFile}`);
    return certFile;
}

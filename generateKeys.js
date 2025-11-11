// generateKeys.js
import fs from "fs";
import crypto from "crypto";
import path from "path";

const keyDir = path.join(process.cwd(), "keys");
if (!fs.existsSync(keyDir)) fs.mkdirSync(keyDir, { recursive: true });

// Генеруємо пару RSA ключів
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

// Зберігаємо у файли
fs.writeFileSync(path.join(keyDir, "private.pem"), privateKey);
fs.writeFileSync(path.join(keyDir, "public.pem"), publicKey);

console.log("✅ RSA key pair generated successfully in /keys folder");



import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const rootEnv = path.join(process.cwd(), '.env');
if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
}

const host = process.env.PGHOST || 'localhost';
const user = process.env.PGUSER || 'postgres';
const password = (process.env.PGPASSWORD || '').replace(/^"|"$/g, '');
const db = process.env.PGDATABASE || 'postgres';
const port = process.env.PGPORT || '5432';

const assembled = process.env.DATABASE_URL || `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}?schema=public`;

const prismaDir = path.join(process.cwd(), 'prisma');
const prismaEnv = path.join(prismaDir, '.env');

if (!fs.existsSync(prismaDir)) {
  fs.mkdirSync(prismaDir, { recursive: true });
}

fs.writeFileSync(prismaEnv, `DATABASE_URL=${assembled}\n`, { encoding: 'utf8' });
console.log(`Prisma .env written at ${prismaEnv}`);


import { jest } from '@jest/globals';
import fs from 'fs';


await jest.unstable_mockModule('pdfkit', () => ({ __esModule: true, default: class { constructor(){ this.page = { width: 595.28, height: 841.89 }; } pipe(){} registerFont(){} font(){ return this; } fontSize(){ return this; } fillColor(){ return this; } image(){ return this; } text(){ return this; } rect(){ return this; } strokeColor(){ return this; } lineWidth(){ return this; } stroke(){ return this; } end(){} moveDown(){ return this; } } }));
await jest.unstable_mockModule('qrcode', () => ({ __esModule: true, default: { toDataURL: async () => 'data:image/png;base64,', toFile: async () => {} }, toDataURL: async () => 'data:image/png;base64,', toFile: async () => {} }));
await jest.unstable_mockModule('../../config/prisma.js', () => ({
  __esModule: true,
  default: {
    certificate: {
      findFirst: jest.fn(async () => ({
        certId: 'C-UA-123456',
        percent: 100,
        issued: new Date(),
        expires: new Date(Date.now()+86400000),
        user: { firstName: 'Test', lastName: 'User' },
        test: { titleUa: 'Мій Тест', titleEn: 'My Test' },
      }))
    }
  }
}));

const { generateCertificatePDF } = await import('../../utils/certificateGenerator.js');

describe('generateCertificatePDF', () => {
  test('creates/returns a pdf path', async () => {
    const certId = 'C-UA-123456';
    const path = await generateCertificatePDF(certId);
    expect(typeof path).toBe('string');
    expect(path.includes(certId)).toBe(true);
    
    if (fs.existsSync(path)) {
      expect(fs.statSync(path).isFile()).toBe(true);
    }
  });
});

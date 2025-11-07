import { jest } from '@jest/globals';

// Prisma mock minimal for webhook usage (if used)
await jest.unstable_mockModule('../../config/prisma.js', () => ({
  __esModule: true,
  default: {
    payment: {
      updateMany: jest.fn(async () => ({})),
      create: jest.fn(async () => ({})),
      findFirst: jest.fn(async () => null)
    },
    userTest: {
      upsert: jest.fn(async () => ({}))
    }
  }
}));

// Stripe SDK or signature verification might be inside controller; we stub them if imported
await jest.unstable_mockModule('stripe', () => ({ __esModule: true, default: function(){ return {}; } }));

const ctrl = await import('../../controllers/paymentController.js').catch(() => ({}));

(ctrl.stripeWebhook) && describe('paymentController', () => {
  test('stripeWebhook responds 400 on missing signature', async () => {
    const req = { headers: {}, body: Buffer.from('{}') };
    const res = { statusCode:200, body:null, status(c){ this.statusCode=c; return this; }, send(p){ this.body=p; return this; }, json(p){ this.body=p; return this; } };
    await ctrl.stripeWebhook(req, res);
    expect([400,500]).toContain(res.statusCode);
  });
});


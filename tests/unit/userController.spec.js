import { jest } from '@jest/globals';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// In-memory store for prisma mock
const users = [];

await jest.unstable_mockModule('../../config/prisma.js', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn((q) => users.find(u => u.email === q.where.email) || null),
      findFirst: jest.fn((q) => users.find(u => u.email === q.where.email && (!q.where.otpCode || u.otpCode === q.where.otpCode)) || null),
      create: jest.fn(({ data }) => { const u = { ...data, id: users.length + 1 }; users.push(u); return Promise.resolve(u); }),
      update: jest.fn(({ where, data }) => { const idx = users.findIndex(u => u.id === where.id); users[idx] = { ...users[idx], ...data }; return Promise.resolve(users[idx]); }),
    }
  }
}));

await jest.unstable_mockModule('../../models/AchievementModel.js', () => ({
  __esModule: true,
  initUserAchievements: jest.fn(async () => ({}))
}));

// Mock Resend to prevent network
await jest.unstable_mockModule('resend', () => ({
  __esModule: true,
  Resend: class { emails = { send: async () => ({}) } }
}));

const { registerUser, verifyOtp, loginUser } = await import('../../controllers/userController.js');
const prisma = (await import('../../config/prisma.js')).default;

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

describe('userController', () => {
  beforeEach(() => {
    // no-op; keep users array across tests for flow
  });

  test('registerUser creates user and returns success', async () => {
    const req = { body: { first_name: 'John', last_name: 'Doe', email: 'john@example.com', password: 'Pass123!' } };
    const res = mockRes();
    await registerUser(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('registerUser missing fields', async () => {
    const req = { body: { first_name: 'John' } };
    const res = mockRes();
    await registerUser(req, res);
    expect(res.statusCode).toBe(400);
  });

  test('registerUser duplicate email returns 400', async () => {
    const req1 = { body: { first_name: 'Dup', last_name: 'User', email: 'dup@example.com', password: 'Pass123!' } }; const res1 = mockRes();
    await registerUser(req1, res1);
    const req2 = { body: { first_name: 'Dup2', last_name: 'User2', email: 'dup@example.com', password: 'Pass123!' } }; const res2 = mockRes();
    await registerUser(req2, res2);
    expect(res2.statusCode).toBe(400);
  });

  test('verifyOtp success path', async () => {
    const req1 = { body: { first_name: 'Anna', last_name: 'Sky', email: 'anna@example.com', password: 'Secret123!' } };
    const res1 = mockRes();
    await registerUser(req1, res1);
    const created = await prisma.user.findUnique({ where: { email: 'anna@example.com' } });
    const req = { body: { email: 'anna@example.com', otp: created.otpCode } };
    const res = mockRes();
    await verifyOtp(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('loginUser fails if not verified', async () => {
    const req1 = { body: { first_name: 'Unv', last_name: 'User', email: 'unv@example.com', password: 'Secret123!' } };
    const res1 = mockRes();
    await registerUser(req1, res1);
    const req = { body: { email: 'unv@example.com', password: 'Secret123!' } };
    const res = mockRes();
    await loginUser(req, res);
    expect(res.statusCode).toBe(403);
  });

  test('loginUser wrong password returns 401', async () => {
    const regReq = { body: { first_name: 'Wrong', last_name: 'Pass', email: 'wrong@example.com', password: 'Secret123!' } }; const regRes = mockRes();
    await registerUser(regReq, regRes);
    // OTP not verified -> first try with wrong password still returns 403 (not verified) unless we verify OTP; verify then wrong password check
    const created = await prisma.user.findUnique({ where: { email: 'wrong@example.com' } });
    const otpReq = { body: { email: 'wrong@example.com', otp: created.otpCode } }; const otpRes = mockRes();
    await verifyOtp(otpReq, otpRes);
    const loginReq = { body: { email: 'wrong@example.com', password: 'BADPASS' } }; const loginRes = mockRes();
    await loginUser(loginReq, loginRes);
    expect(loginRes.statusCode).toBe(401);
  });
});

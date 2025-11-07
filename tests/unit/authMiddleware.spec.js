import { jest } from '@jest/globals';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const users = [
  { id: 1, email: 'user@example.com', role: 'user', firstName: 'User', lastName: 'One' },
  { id: 2, email: 'admin@example.com', role: 'admin', firstName: 'Admin', lastName: 'Root' }
];

await jest.unstable_mockModule('../../config/prisma.js', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(({ where }) => users.find(u => u.id === where.id) || null)
    }
  }
}));

await jest.unstable_mockModule('jsonwebtoken', () => ({
  __esModule: true,
  default: {
    verify: (token) => {
      if (token === 'valid-user') return { id: 1 };
      if (token === 'valid-admin') return { id: 2 };
      throw new Error('invalid');
    }
  },
  verify: (token) => {
    if (token === 'valid-user') return { id: 1 };
    if (token === 'valid-admin') return { id: 2 };
    throw new Error('invalid');
  }
}));

const { default: authMiddleware, isAdmin } = await import('../../middleware/authMiddleware.js');

function mockReq(headers = {}) { return { headers, method: 'GET', originalUrl: '/api/test' }; }
function mockRes() { return { statusCode: 200, body: null, status(c){ this.statusCode=c; return this; }, json(p){ this.body=p; return this; } }; }

describe('authMiddleware', () => {
  test('rejects missing auth header', async () => {
    const req = mockReq(); const res = mockRes();
    await authMiddleware(req,res,()=>{});
    expect(res.statusCode).toBe(401);
  });
  test('rejects invalid format', async () => {
    const req = mockReq({ authorization: 'Token something' }); const res = mockRes();
    await authMiddleware(req,res,()=>{});
    expect(res.statusCode).toBe(401);
  });
  test('rejects invalid token', async () => {
    const req = mockReq({ authorization: 'Bearer bad' }); const res = mockRes();
    await authMiddleware(req,res,()=>{});
    expect([401,403]).toContain(res.statusCode);
  });
  test('accepts valid user token', async () => {
    const req = mockReq({ authorization: 'Bearer valid-user' }); const res = mockRes();
    let progressed = false;
    await authMiddleware(req,res,()=>{ progressed=true; });
    expect(progressed).toBe(true);
    expect(req.user.email).toBe('user@example.com');
  });
});

describe('isAdmin', () => {
  test('blocks non-admin', () => {
    const req = { user: { role: 'user' } }; const res = mockRes();
    let progressed=false;
    isAdmin(req,res,()=>{ progressed=true; });
    expect(progressed).toBe(false);
    expect(res.statusCode).toBe(403);
  });
  test('allows admin', () => {
    const req = { user: { role: 'admin' } }; const res = mockRes();
    let progressed=false;
    isAdmin(req,res,()=>{ progressed=true; });
    expect(progressed).toBe(true);
  });
});


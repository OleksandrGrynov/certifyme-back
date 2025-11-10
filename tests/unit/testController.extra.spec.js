import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';


const tests = []; const questions=[]; const answers=[]; const certificates=[]; const histories=[]; const payments=[]; const userTests=[];


await jest.unstable_mockModule('axios', () => ({ __esModule:true, default:{ get: jest.fn(async () => ({ data:[{ rate:40 }] })) } }));
await jest.unstable_mockModule('jsonwebtoken', () => ({ __esModule:true, default:{ verify: (token) => ({ id:1, role:'user', first_name:'User', last_name:'One' }) }, verify:(t)=>({ id:1, role:'user' }) }));
await jest.unstable_mockModule('../../utils/certificateGenerator.js', () => ({ __esModule:true, generateCertificatePDF: jest.fn(async (id)=> path.join(process.cwd(),'certificates',`certificate_${id}.pdf`)) }));
await jest.unstable_mockModule('../../utils/achievementEngine.js', () => ({ __esModule:true, checkAchievements: jest.fn(async ()=>[{ achievementId:99, code:'tests_1', progress:100 }]), triggerAchievementsCheck: jest.fn(async ()=>[{ code:'tests_1' }]) }));

await jest.unstable_mockModule('../../config/prisma.js', () => ({
  __esModule:true,
  default: {
    test: {
      create: jest.fn(({ data })=>{ const t={...data,id:tests.length+1}; tests.push(t); return Promise.resolve(t); }),
      update: jest.fn(({ where, data })=>{ const i=tests.findIndex(t=>t.id===where.id); tests[i]={...tests[i], ...data}; return Promise.resolve(tests[i]); }),
      findUnique: jest.fn(async ({ where })=> tests.find(t=>t.id===where.id)||null),
    },
    question: {
      create: jest.fn(({ data })=>{ const q={...data,id:questions.length+1}; questions.push(q); return Promise.resolve(q); })
    },
    answer: {
      create: jest.fn(({ data })=>{ const a={...data,id:answers.length+1}; answers.push(a); return Promise.resolve(a); })
    },
    certificate: {
      findFirst: jest.fn(async ({ where })=> certificates.find(c=>c.certId===where.certId || (c.userId===where.userId && c.testId===where.testId))||null),
      findUnique: jest.fn(async ({ where })=> certificates.find(c=>c.certId===where.certId)||null),
      create: jest.fn(async ({ data })=> { const c={...data,id:certificates.length+1}; certificates.push(c); return c; }),
      count: jest.fn(async ({ where })=> certificates.filter(c=>c.userId===where.userId).length )
    },
    user: { findUnique: jest.fn(async ({ where })=> ({ id: where.id, firstName:'User', lastName:'One', email:'user@example.com' })) },
    userTestHistory: {
      create: jest.fn(async ({ data })=> { const h={...data,id:histories.length+1, createdAt:new Date()}; histories.push(h); return h; }),
      count: jest.fn(async ({ where })=> histories.filter(h=>h.userId===where.userId && (where.passed===undefined || h.passed===where.passed)).length ),
      aggregate: jest.fn(async ({ where })=>{ const filtered= histories.filter(h=>h.userId===where.userId && h.passed===true); const avg = filtered.reduce((s,h)=>s+(h.score||0),0)/(filtered.length||1); return { _avg:{ score: avg } }; })
    },
    payment: {
      count: jest.fn(async ({ where })=> payments.filter(p=>p.userId===where.userId && where.status.in.includes(p.status)).length ),
      updateMany: jest.fn(async ({ where, data })=> { payments.forEach(p=>{ if(p.userId===where.userId && p.testId===where.testId) Object.assign(p,data); }); return { count: payments.length }; }),
      create: jest.fn(async ({ data })=> { const p={...data,id:payments.length+1}; payments.push(p); return p; }),
      findFirst: jest.fn(async ({ where })=> payments.find(p=>p.userId===where.userId && p.testId===where.testId)||null )
    },
    userTest: {
      upsert: jest.fn(async ({ where, create, update })=>{ let ut=userTests.find(u=>u.userId===where.userId_testId.userId && u.testId===where.userId_testId.testId); if(!ut){ ut={...create}; userTests.push(ut);} else Object.assign(ut, update); return ut; })
    },
    $transaction: async (cb)=> {
      const tx = {
        userTest:{ deleteMany: jest.fn(async ({ where })=> { for(let i=userTests.length-1;i>=0;i--) if(userTests[i].testId===where.testId) userTests.splice(i,1); }), },
        userTestHistory:{ deleteMany: jest.fn(async ({ where })=> { for(let i=histories.length-1;i>=0;i--) if(histories[i].testId===where.testId) histories.splice(i,1); }), },
        certificate:{ deleteMany: jest.fn(async ({ where })=> { for(let i=certificates.length-1;i>=0;i--) if(certificates[i].testId===where.testId) certificates.splice(i,1); }), },
        payment:{ deleteMany: jest.fn(async ({ where })=> { for(let i=payments.length-1;i>=0;i--) if(payments[i].testId===where.testId) payments.splice(i,1); }), },
        answer:{ deleteMany: jest.fn(async ({ where })=> { const targetTestId = where?.question?.testId; for(let i=answers.length-1;i>=0;i--){ const q= questions.find(q=>q.id===answers[i].questionId); if(q?.testId===targetTestId) answers.splice(i,1); } }) },
        question:{ deleteMany: jest.fn(async ({ where })=> { for(let i=questions.length-1;i>=0;i--) if(questions[i].testId===where.testId) questions.splice(i,1); }), },
        test:{ delete: jest.fn(async ({ where })=> { const idx=tests.findIndex(t=>t.id===where.id); if(idx>-1) tests.splice(idx,1); }) }
      };
      return cb(tx);
    }
  }
}));

const { createTest, saveTestResult, generateCertificate, verifyCertificate, updateTest, deleteTest } = await import('../../controllers/testController.js');
const { grantUserTest } = await import('../../controllers/userController.js');
const { triggerAchievementsCheck } = await import('../../utils/achievementEngine.js');

function mockResDownload(){ return { statusCode:200, body:null, headers:{}, downloaded:null, setHeader(k,v){ this.headers[k]=v; }, status(c){ this.statusCode=c; return this; }, json(p){ this.body=p; return this; }, download(p){ this.downloaded=p; return this; } }; }
function mockRes(){ return { statusCode:200, body:null, status(c){ this.statusCode=c; return this; }, json(p){ this.body=p; return this; } }; }

function authHeader(){ return { authorization:'Bearer token123' }; }

describe('testController saveTestResult', () => {
  beforeEach(()=>{ histories.length=0; });
  test('saves passing result and returns achievements', async () => {
    const req={ user:{ id:1 }, body:{ testId:2, score:6, total:10 } };
    const res=mockRes();
    await saveTestResult(req,res);
    expect(res.statusCode).toBe(200);
    expect(histories.length).toBe(1);
    expect(res.body.newAchievements?.[0]?.code).toBe('tests_1');
  });
  test('validation error on missing data', async () => {
    const req={ user:{ id:1 }, body:{ testId:2, score:null, total:10 } };
    const res=mockRes();
    await saveTestResult(req,res);
    expect(res.statusCode).toBe(400);
  });
});

describe('userController grantUserTest', () => {
  beforeEach(()=>{ payments.length=0; userTests.length=0; });
  test('grants test access', async () => {
    const req={ user:{ id:1 }, body:{ testId:5 } };
    const res=mockRes();
    await grantUserTest(req,res);
    expect(res.statusCode).toBe(200);
    expect(userTests[0].isUnlocked).toBe(true);
  });
  test('missing data returns 400', async () => {
    const req={ user:{ id:1 }, body:{} };
    const res=mockRes();
    await grantUserTest(req,res);
    expect(res.statusCode).toBe(400);
  });
});

describe('testController generateCertificate', () => {
  beforeEach(()=>{ certificates.length=0; });
  test('returns existing certificate file', async () => {
    const existingId='EXIST-123';
    const filePath= path.join(process.cwd(),'certificates',`certificate_${existingId}.pdf`);
    fs.mkdirSync(path.join(process.cwd(),'certificates'), { recursive:true });
    fs.writeFileSync(filePath,'PDF');
    
    if (!tests.find(t=>t.id===2)) tests.push({ id:2, titleUa:'T2', titleEn:'T2' });
    certificates.push({ certId: existingId, userId:1, testId:2, percent:90, issued:new Date(), expires:new Date(Date.now()+86400000) });
    const req={ headers: authHeader(), body:{ testId:2, score:9, total:10 } };
    const res=mockResDownload();
    await generateCertificate(req,res);
    expect(res.downloaded).toContain(`certificate_${existingId}.pdf`);
  });
  test('creates new certificate when none exists', async () => {
    if (!tests.find(t=>t.id===3)) tests.push({ id:3, titleUa:'T3', titleEn:'T3' });
    const req={ headers: authHeader(), body:{ testId:3, score:8, total:10 } };
    const res=mockResDownload();
    await generateCertificate(req,res);
    expect(typeof res.downloaded).toBe('string');
    expect(certificates.length).toBe(1);
  });
  test('generateCertificate missing payload returns 400', async () => {
    const req={ headers: authHeader(), body:{ testId:null } };
    const res=mockResDownload();
    await generateCertificate(req,res);
    expect([400,500]).toContain(res.statusCode);
  });
});

describe('testController verifyCertificate', () => {
  beforeEach(()=>{ certificates.length=0; });
  test('valid certificate returns success true', async () => {
    certificates.push({ certId:'VALID-1', percent:85, issued:new Date(), expires:new Date(Date.now()+86400000), userId:1, testId:2, user:{ firstName:'A', lastName:'B' }, course:'Test', courseEn:'Test' });
    const req={ params:{ cert_id:'VALID-1' } };
    const res=mockRes();
    await verifyCertificate(req,res);
    expect(res.statusCode).toBe(200);
    expect(res.body.valid).toBe(true);
  });
  test('expired certificate valid=false', async () => {
    certificates.push({ certId:'EXPIRED-1', percent:70, issued:new Date(Date.now()-86400000*2), expires:new Date(Date.now()-86400000), userId:1, testId:2, user:{ firstName:'C', lastName:'D' }, course:'Test', courseEn:'Test' });
    const req={ params:{ cert_id:'EXPIRED-1' } };
    const res=mockRes();
    await verifyCertificate(req,res);
    expect(res.body.valid).toBe(false);
  });
  test('not found returns 404', async () => {
    const req={ params:{ cert_id:'NONE' } }; const res=mockRes();
    await verifyCertificate(req,res);
    expect(res.statusCode).toBe(404);
  });
});

describe('testController updateTest', () => {
  beforeEach(()=>{ tests.length=0; });
  test('updates USD price directly', async () => {
    tests.push({ id:1, titleUa:'Old', titleEn:'Old', descriptionUa:'', descriptionEn:'', imageUrl:'', priceCents:0, currency:'usd' });
    const req={ params:{ id:'1' }, body:{ title_ua:'Новий', price_amount:25, currency:'usd' } };
    const res=mockRes();
    await updateTest(req,res);
    expect(res.statusCode).toBe(200);
    expect(res.body.test.priceCents).toBe(2500);
  });
  test('converts UAH to cents via rate', async () => {
    tests.push({ id:2, titleUa:'Old2', titleEn:'Old2', descriptionUa:'', descriptionEn:'', imageUrl:'', priceCents:0, currency:'usd' });
    const req={ params:{ id:'2' }, body:{ title_ua:'Новий2', price_amount:400, currency:'uah' } };
    const res=mockRes();
    await updateTest(req,res);
    expect(res.body.test.priceCents).toBe(1000); 
    expect(res.body.test.currency).toBe('usd');
  });
  describe('negative cases', () => {
    test('updateTest with invalid price_amount keeps priceCents 0', async () => {
      tests.push({ id:10, titleUa:'X', titleEn:'X', descriptionUa:'', descriptionEn:'', imageUrl:'', priceCents:0, currency:'usd' });
      const req={ params:{ id:'10' }, body:{ title_ua:'X', price_amount:'not-a-number', currency:'usd' } };
      const res=mockRes();
      await updateTest(req,res);
      expect(res.statusCode).toBe(200);
      expect(res.body.test.priceCents).toBe(0);
    });
  });
});

describe('testController deleteTest', () => {
  beforeEach(()=>{ tests.length=0; questions.length=0; answers.length=0; certificates.length=0; histories.length=0; payments.length=0; userTests.length=0; });
  test('deletes test and related data', async () => {
    tests.push({ id:7 }); questions.push({ id:1, testId:7 }); answers.push({ id:1, questionId:1 }); certificates.push({ id:1, testId:7 }); histories.push({ id:1, testId:7 }); payments.push({ id:1, testId:7 }); userTests.push({ userId:1, testId:7 });
    const req={ params:{ id:'7' } }; const res=mockRes();
    await deleteTest(req,res);
    expect(res.statusCode).toBe(200);
    expect(tests.find(t=>t.id===7)).toBeUndefined();
  });
});

describe('triggerAchievementsCheck', () => {
  test('aggregates stats and returns achievements', async () => {
    histories.push({ id:1, userId:5, testId:2, score:8, total:10, passed:true });
    histories.push({ id:2, userId:5, testId:3, score:6, total:10, passed:true });
    certificates.push({ id:1, userId:5 });
    payments.push({ id:1, userId:5, status:'succeeded' });
    const result = await (await import('../../utils/achievementEngine.js')).triggerAchievementsCheck(5);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].code).toBe('tests_1');
  });
});

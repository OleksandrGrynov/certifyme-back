import { jest } from '@jest/globals';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';


await jest.unstable_mockModule('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(async (_url, _opts) => ({ data: [[['translated']]] }))
  }
}));

const tests = []; const questions = []; const answers = [];

await jest.unstable_mockModule('../../config/prisma.js', () => ({
  __esModule: true,
  default: {
    test: {
      create: jest.fn(({ data }) => { const t = { ...data, id: tests.length + 1 }; tests.push(t); return Promise.resolve(t); }),
      findUnique: jest.fn(async ({ where, select }) => {
        const t = tests.find(tt => tt.id === where.id);
        if (!t) return null;
        const root = {};
        if (!select) return t;
        if (select.id) root.id = t.id;
        if (select.titleUa) root.titleUa = t.titleUa;
        if (select.titleEn) root.titleEn = t.titleEn;
        if (select.descriptionUa) root.descriptionUa = t.descriptionUa;
        if (select.descriptionEn) root.descriptionEn = t.descriptionEn;
        if (select.imageUrl) root.imageUrl = t.imageUrl;
        if (select.priceCents) root.priceCents = t.priceCents;
        if (select.currency) root.currency = t.currency;
        if (select.questions) {
          
          const qs = questions.filter(q => q.testId === t.id).sort((a,b)=>a.id-b.id).map(q => {
            const qObj = {};
            const qSel = select.questions.select || {};
            if (qSel.id) qObj.id = q.id;
            if (qSel.questionUa) qObj.questionUa = q.questionUa;
            if (qSel.questionEn) qObj.questionEn = q.questionEn;
            if (qSel.answers) {
              const aSel = qSel.answers.select || {};
              qObj.answers = answers.filter(a => a.questionId === q.id).sort((a,b)=>a.id-b.id).map(a => {
                const aa = {};
                if (aSel.id) aa.id = a.id;
                if (aSel.answerUa) aa.answerUa = a.answerUa;
                if (aSel.answerEn) aa.answerEn = a.answerEn;
                if (aSel.isCorrect) aa.isCorrect = a.isCorrect;
                return aa;
              });
            }
            return qObj;
          });
          root.questions = qs;
        }
        return root;
      }),
      findMany: jest.fn(() => Promise.resolve(tests))
    },
    question: {
      create: jest.fn(({ data }) => { const q = { ...data, id: questions.length + 1 }; questions.push(q); return Promise.resolve(q); }),
      findMany: jest.fn(({ where }) => Promise.resolve(questions.filter(q => q.testId === where.testId)))
    },
    answer: {
      create: jest.fn(({ data }) => { const a = { ...data, id: answers.length + 1 }; answers.push(a); return Promise.resolve(a); }),
      findMany: jest.fn(({ where }) => Promise.resolve(answers.filter(a => a.questionId === where.questionId)))
    }
  }
}));

const { createTest, getTestById } = await import('../../controllers/testController.js');

function mockRes() { return { statusCode: 200, body: null, status(c){ this.statusCode=c; return this; }, json(p){ this.body=p; return this; } }; }

describe('testController', () => {
  beforeEach(() => {  });

  test('createTest stores test and questions', async () => {
    const req = { body: { title_ua: 'Тест', questions: [ { question_ua: 'Q1', answers: [ { answer_ua: 'A1', is_correct: true } ] } ] } };
    const res = mockRes();
    await createTest(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(tests.length).toBeGreaterThanOrEqual(1);
  });

  test('getTestById returns formatted test', async () => {
    const req1 = { body: { title_ua: 'Тест2', questions: [ { question_ua: 'Q1', answers: [ { answer_ua: 'A1', is_correct: true }, { answer_ua: 'A2', is_correct: false } ] } ] } };
    const res1 = mockRes();
    await createTest(req1, res1);
    const newId = tests.length; 
    const req = { params: { id: String(newId) } };
    const res = mockRes();
    await getTestById(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.test.questions[0].answers.length).toBe(2);
  });
});

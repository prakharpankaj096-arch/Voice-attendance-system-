/**
 * Route Tests — Search, Attendance History, Admin APIs
 * =====================================================
 * Tests the new backend routes added for Tasks 2–5.
 * Uses real Supabase. Tests are designed to work with or without data.
 */

const request = require('supertest');
const app = require('../src/index');

const { supabase } = require('../src/supabaseClient');

jest.setTimeout(20000);

const adminToken = 'routes-admin-token';

beforeAll(() => {
  jest.spyOn(supabase.auth, 'getUser').mockImplementation(async (token) => {
    if (token === adminToken) {
      return {
        data: {
          user: {
            id: '00000000-0000-4000-8000-000000000001',
            email: 'admin@example.com',
            role: 'admin',
            user_metadata: { role: 'admin' },
          },
        },
        error: null,
      };
    }
    return {
      data: { user: null },
      error: new Error('Invalid token'),
    };
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

// ── Attendance History ────────────────────────────────────────────
describe('GET /attendance/:studentId', () => {

  test('returns 401 without auth', async () => {
    const fakeUUID = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).get(`/attendance/${fakeUUID}`);
    expect(res.status).toBe(401);
  });

  test('returns 404 for nonexistent student UUID', async () => {
    const fakeUUID = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .get(`/attendance/${fakeUUID}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toMatch(/not found/i);
  });

  // If there's a known student, test their history shape
  test('returns attendance data with expected shape for valid student', async () => {
    // Find a real student via Supabase
    const { data } = await supabase.from('students').select('id').limit(1);
    if (data && data.length > 0) {
      const studentId = data[0].id;
      const res = await request(app)
        .get(`/attendance/${studentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('id');
        expect(res.body[0]).toHaveProperty('date');
        expect(res.body[0]).toHaveProperty('time');
        expect(res.body[0]).toHaveProperty('status');
        expect(res.body[0]).toHaveProperty('verification_score');
        expect(res.body[0]).not.toHaveProperty('voice_embedding');
      }
    }
  });
});

// ── Admin Routes (without auth — should return 401) ───────────────
describe('Admin Routes — Auth Protection', () => {
  test('PUT /admin/students/:id returns 401 without auth', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .put(`/admin/students/${fakeId}`)
      .send({ name: 'Test' });
    expect(res.status).toBe(401);
  });

  test('GET /admin/attendance returns 401 without auth', async () => {
    const res = await request(app).get('/admin/attendance');
    expect(res.status).toBe(401);
  });

  test('PUT /admin/students/:id returns 401 with invalid token', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .put(`/admin/students/${fakeId}`)
      .set('Authorization', 'Bearer invalid_token_12345')
      .send({ name: 'Test' });
    expect(res.status).toBe(401);
  });
});

// ── Attendance Percentage Endpoint ─────────────────────────────────
describe('GET /attendance/:studentId/percentage', () => {
  const adminToken = 'routes-admin-token';

  test('returns 401 without auth', async () => {
    const fakeUUID = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).get(`/attendance/${fakeUUID}/percentage`);
    expect(res.status).toBe(401);
  });

  test('returns 404 for nonexistent student UUID when authenticated', async () => {
    const fakeUUID = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .get(`/attendance/${fakeUUID}/percentage`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

// ── Assistant Query Endpoint ───────────────────────────────────────
describe('POST /assistant/query', () => {
  test('returns 400 when text query is missing', async () => {
    const res = await request(app).post('/assistant/query').send({});
    expect(res.status).toBe(400);
  });

  test('handles unknown intent gracefully', async () => {
    const res = await request(app)
      .post('/assistant/query')
      .send({ text: 'tell me a joke' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.intent).toBe('unknown');
    expect(res.body).toHaveProperty('message');
  });

  test('handles search_student intent', async () => {
    const res = await request(app)
      .post('/assistant/query')
      .send({ text: 'search Prakhar' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.intent).toBe('search_student');
    expect(res.body).toHaveProperty('message');
    expect(Array.isArray(res.body.results)).toBe(true);
  });
});


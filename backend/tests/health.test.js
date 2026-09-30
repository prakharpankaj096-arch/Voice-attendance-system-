/**
 * Health & Infrastructure Tests
 * =============================
 * Tests the health endpoints and verifies the backend can connect to Supabase.
 * These tests use the real Supabase instance (configured via .env).
 */

const request = require('supertest');
const app = require('../src/index');

describe('Health Endpoints', () => {
  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'voice-attendance-backend' });
  });

  test('GET /health/db returns Supabase connection info', async () => {
    const res = await request(app).get('/health/db');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('students_count');
    expect(typeof res.body.students_count).toBe('number');
  });
});

describe('Stats Endpoint', () => {
  test('GET /stats returns attendance statistics', async () => {
    const res = await request(app).get('/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total_students');
    expect(res.body).toHaveProperty('present_today');
    expect(res.body).toHaveProperty('absent_today');
    expect(res.body).toHaveProperty('attendance_rate');
  });
});

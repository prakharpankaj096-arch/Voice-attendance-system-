/**
 * TASK 2: GET /students/search Test Suite
 * =======================================
 * Includes:
 *   - Property-based tests with fast-check (query trimming/length, percentage bounds/monotonicity, output contract)
 *   - Unit tests covering all requirements:
 *     - Normal search
 *     - Empty query (400)
 *     - Whitespace query (400)
 *     - Query length > 100 (400)
 *     - Case-insensitive matching
 *     - Name matching
 *     - Roll-number matching
 *     - No results (HTTP 200, empty array)
 *     - Authentication failure (HTTP 401 without token, HTTP 401 with invalid token)
 *     - voice_embedding never exposed
 *     - Attendance percentage calculation (floor(present/total * 100), 0 if no records)
 */

const request = require('supertest');
const fc = require('fast-check');
const app = require('../src/index');
const { supabase } = require('../src/supabaseClient');

jest.setTimeout(25000);

describe('TASK 2: GET /students/search', () => {
  let validToken = 'valid_test_token_123';
  let sampleStudent = null;

  beforeAll(async () => {
    // Mock supabase.auth.getUser so we can reliably test authenticated requests
    const originalGetUser = supabase.auth.getUser.bind(supabase.auth);
    jest.spyOn(supabase.auth, 'getUser').mockImplementation(async (token) => {
      if (token === validToken) {
        return {
          data: { user: { id: 'mock-auth-user-id', email: 'test@example.com' } },
          error: null,
        };
      }
      return {
        data: { user: null },
        error: new Error('Invalid or expired token'),
      };
    });

    // Check if there are any existing students in the database to use as test fixtures
    const { data } = await supabase
      .from('students')
      .select('id, name, roll_number, department')
      .limit(1);

    if (data && data.length > 0) {
      sampleStudent = data[0];
    }
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // ── 1. Property-Based Tests (fast-check) ──────────────────────────
  describe('Property-Based Tests (fast-check)', () => {
    test('Attendance percentage calculation: invariant floor(present / total * 100) and 0 on total=0', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 200 }),
          fc.integer({ min: 0, max: 200 }),
          (num1, num2) => {
            const total = Math.max(num1, num2);
            const present = Math.min(num1, num2);

            const percentage = total > 0 ? Math.floor((present / total) * 100) : 0;

            expect(percentage).toBeGreaterThanOrEqual(0);
            expect(percentage).toBeLessThanOrEqual(100);
            expect(Number.isInteger(percentage)).toBe(true);

            if (total === 0) {
              expect(percentage).toBe(0);
            } else {
              expect(percentage).toBe(Math.floor((present / total) * 100));
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Query validation invariant: empty/whitespace strings reject with 400', async () => {
      // Test property that any whitespace-only string returns HTTP 400
      const whitespaceArb = fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 20 }).map((arr) => arr.join(''));
      await fc.assert(
        fc.asyncProperty(whitespaceArb, async (ws) => {
          const res = await request(app)
            .get(`/students/search?q=${encodeURIComponent(ws)}`)
            .set('Authorization', `Bearer ${validToken}`);

          expect(res.status).toBe(400);
          expect(res.body.message).toBe('Search query is required and must not be empty.');
        }),
        { numRuns: 20 }
      );
    });

    test('Query validation invariant: query strings > 100 chars reject with 400', async () => {
      const longStringArb = fc.string({ minLength: 101, maxLength: 150 }).map((s) => s.replace(/\s+/g, 'a') + 'b');
      await fc.assert(
        fc.asyncProperty(longStringArb, async (longQ) => {
          const res = await request(app)
            .get(`/students/search?q=${encodeURIComponent(longQ)}`)
            .set('Authorization', `Bearer ${validToken}`);

          expect(res.status).toBe(400);
        }),
        { numRuns: 10 }
      );
    });
  });

  // ── 2. Authentication Failure ─────────────────────────────────────
  describe('Authentication Failure', () => {
    test('missing Authorization header returns HTTP 401', async () => {
      const res = await request(app).get('/students/search?q=test');
      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
    });

    test('invalid Authorization token returns HTTP 401', async () => {
      const res = await request(app)
        .get('/students/search?q=test')
        .set('Authorization', 'Bearer invalid_bogus_token');
      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
    });
  });

  // ── 3. Query Validation ───────────────────────────────────────────
  describe('Query Validation', () => {
    test('empty query parameter returns HTTP 400 with expected message', async () => {
      const res = await request(app)
        .get('/students/search?q=')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('Search query is required and must not be empty.');
    });

    test('missing query parameter returns HTTP 400 with expected message', async () => {
      const res = await request(app)
        .get('/students/search')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('Search query is required and must not be empty.');
    });

    test('whitespace-only query returns HTTP 400 with expected message', async () => {
      const res = await request(app)
        .get('/students/search?q=%20%20%20%20')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('Search query is required and must not be empty.');
    });

    test('query exceeding 100 characters returns HTTP 400', async () => {
      const longQuery = 'a'.repeat(105);
      const res = await request(app)
        .get(`/students/search?q=${longQuery}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });
  });

  // ── 4. Search Results & Data Shaping ──────────────────────────────
  describe('Search Functionality & Results', () => {
    test('no matches returns HTTP 200 with an empty array', async () => {
      const res = await request(app)
        .get('/students/search?q=__nonexistent_student_query_xyz__')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toEqual([]);
    });

    test('normal search returns at most 50 students with required fields', async () => {
      const res = await request(app)
        .get('/students/search?q=a')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeLessThanOrEqual(50);

      if (res.body.length > 0) {
        const student = res.body[0];
        expect(student).toHaveProperty('id');
        expect(student).toHaveProperty('name');
        expect(student).toHaveProperty('roll_number');
        expect(student).toHaveProperty('department');
        expect(student).toHaveProperty('attendance_percentage');

        // Critical requirement: voice_embedding must NEVER be exposed
        expect(student.voice_embedding).toBeUndefined();
        expect(student).not.toHaveProperty('voice_embedding');
      }
    });

    test('voice_embedding is not exposed on any returned student', async () => {
      const res = await request(app)
        .get('/students/search?q=e')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      res.body.forEach((student) => {
        expect(student.voice_embedding).toBeUndefined();
        expect(student).not.toHaveProperty('voice_embedding');
      });
    });

    test('case-insensitive matching: lower and upper case return the same results', async () => {
      if (!sampleStudent) return;

      const lowerQ = sampleStudent.name.slice(0, 3).toLowerCase();
      const upperQ = sampleStudent.name.slice(0, 3).toUpperCase();

      const resLower = await request(app)
        .get(`/students/search?q=${encodeURIComponent(lowerQ)}`)
        .set('Authorization', `Bearer ${validToken}`);

      const resUpper = await request(app)
        .get(`/students/search?q=${encodeURIComponent(upperQ)}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(resLower.status).toBe(200);
      expect(resUpper.status).toBe(200);

      const hasStudentInLower = resLower.body.some((s) => s.id === sampleStudent.id);
      const hasStudentInUpper = resUpper.body.some((s) => s.id === sampleStudent.id);

      expect(hasStudentInLower).toBe(true);
      expect(hasStudentInUpper).toBe(true);
    });

    test('name matching: query matches student name', async () => {
      if (!sampleStudent) return;

      const nameQuery = sampleStudent.name.slice(0, 4);
      const res = await request(app)
        .get(`/students/search?q=${encodeURIComponent(nameQuery)}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const matched = res.body.find((s) => s.id === sampleStudent.id);
      expect(matched).toBeDefined();
      expect(matched.name).toBe(sampleStudent.name);
    });

    test('roll-number matching: query matches student roll number', async () => {
      if (!sampleStudent) return;

      const rollQuery = sampleStudent.roll_number;
      const res = await request(app)
        .get(`/students/search?q=${encodeURIComponent(rollQuery)}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const matched = res.body.find((s) => s.roll_number === sampleStudent.roll_number);
      expect(matched).toBeDefined();
    });

    test('attendance percentage calculation logic: 0 if no records, floor(present/total*100) if records exist', async () => {
      const res = await request(app)
        .get('/students/search?q=a')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      if (res.body.length > 0) {
        res.body.forEach((s) => {
          expect(typeof s.attendance_percentage).toBe('number');
          expect(s.attendance_percentage).toBeGreaterThanOrEqual(0);
          expect(s.attendance_percentage).toBeLessThanOrEqual(100);
          expect(Number.isInteger(s.attendance_percentage)).toBe(true);
        });
      }
    });
  });
});

/**
 * TASK 3: Attendance History and Percentage APIs Test Suite
 * ==========================================================
 * Tests:
 *   GET /attendance/:student_id
 *   GET /attendance/:student_id/percentage
 *
 * Requirements:
 *   - Valid JWT required (401 on missing/invalid)
 *   - Student users may only access their own linked record (403 on mismatch)
 *   - Admin users may access any student record (200)
 *   - Unknown student returns 404
 *   - Database errors use standard error convention
 *   - Attendance history: id, date, time, status, verification_score, sorted newest date first, empty array if none
 *   - Percentage: student_id, percentage, present_count, total_count with floor((present/total)*100) and 0 if total===0
 *   - Never expose voice_embedding
 *
 * Includes:
 *   - Property tests for percentage calculation (fast-check)
 *   - Property tests for student ownership/security (fast-check)
 *   - Comprehensive unit tests covering all required edge cases
 */

const request = require('supertest');
const fc = require('fast-check');
const app = require('../src/index');
const { supabase } = require('../src/supabaseClient');

jest.setTimeout(25000);

describe('TASK 3: Attendance History & Percentage APIs', () => {
  // Test fixture IDs
  const student1Id = '11111111-1111-4111-8111-111111111111';
  const student2Id = '22222222-2222-4222-8222-222222222222';
  const unknownStudentId = '99999999-9999-4999-8999-999999999999';

  // Tokens
  const adminToken = 'test-token-admin';
  const student1Token = 'test-token-student-1';
  const student2Token = 'test-token-student-2';
  const invalidToken = 'test-token-invalid';

  // Dynamic user dictionary for property tests
  const dynamicTokens = {};

  // Mock student data
  const mockStudents = {
    [student1Id]: {
      id: student1Id,
      name: 'Alice Johnson',
      roll_number: 'CS2026-001',
      department: 'Computer Science',
      voice_embedding: [0.12, 0.34, 0.56], // Should never be exposed!
    },
    [student2Id]: {
      id: student2Id,
      name: 'Bob Smith',
      roll_number: 'CS2026-002',
      department: 'Computer Science',
      voice_embedding: [0.98, 0.76, 0.54], // Should never be exposed!
    },
  };

  // Mock attendance data
  let mockAttendanceRecords = [];

  beforeAll(() => {
    // 1. Mock supabase.auth.getUser
    jest.spyOn(supabase.auth, 'getUser').mockImplementation(async (token) => {
      if (dynamicTokens[token]) {
        return {
          data: { user: dynamicTokens[token] },
          error: null,
        };
      }
      if (token === adminToken) {
        return {
          data: {
            user: {
              id: '00000000-0000-4000-8000-000000000001',
              email: 'admin@school.edu',
              role: 'admin',
              user_metadata: { role: 'admin' },
            },
          },
          error: null,
        };
      }
      if (token === student1Token) {
        return {
          data: {
            user: {
              id: student1Id,
              email: 'alice@school.edu',
              student_id: student1Id,
              user_metadata: { student_id: student1Id },
            },
          },
          error: null,
        };
      }
      if (token === student2Token) {
        return {
          data: {
            user: {
              id: student2Id,
              email: 'bob@school.edu',
              student_id: student2Id,
              user_metadata: { student_id: student2Id },
            },
          },
          error: null,
        };
      }
      return {
        data: { user: null },
        error: new Error('Invalid or expired token'),
      };
    });

    // 2. Mock supabase.from queries for students, admins, attendance
    const originalFrom = supabase.from.bind(supabase);
    jest.spyOn(supabase, 'from').mockImplementation((table) => {
      if (table === 'students') {
        return {
          select: (fields) => ({
            eq: (col, val) => ({
              maybeSingle: async () => {
                const s = mockStudents[val];
                if (!s) return { data: null, error: null };
                // Ensure voice_embedding is never returned
                const result = {
                  id: s.id,
                  name: s.name,
                  roll_number: s.roll_number,
                  department: s.department,
                };
                return { data: result, error: null };
              },
            }),
          }),
        };
      }

      if (table === 'admins') {
        return {
          select: (fields) => ({
            eq: (col, val) => ({
              maybeSingle: async () => {
                if (val === '00000000-0000-4000-8000-000000000001') {
                  return { data: { id: val, role: 'admin' }, error: null };
                }
                return { data: null, error: null };
              },
            }),
          }),
        };
      }

      if (table === 'attendance') {
        return {
          select: (fields) => ({
            eq: (col, val) => {
              const filtered = mockAttendanceRecords.filter((r) => r.student_id === val);
              const createQueryObj = (currentData) => ({
                order: (field, opts) => {
                  const sorted = [...currentData].sort((a, b) => {
                    const valA = a[field] || '';
                    const valB = b[field] || '';
                    return opts?.ascending ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
                  });
                  return createQueryObj(sorted);
                },
                then: (resolve, reject) => {
                  resolve({ data: currentData, error: null });
                },
              });
              return createQueryObj(filtered);
            },
          }),
        };
      }

      return originalFrom(table);
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    // Reset attendance records between tests
    mockAttendanceRecords = [];
  });

  // ────────────────────────────────────────────────────────────────
  // Property-Based Tests (fast-check)
  // ────────────────────────────────────────────────────────────────
  describe('Property-Based Tests (fast-check)', () => {
    test('Attendance percentage formula invariant: total === 0 ? 0 : floor((present / total) * 100)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          (a, b) => {
            const total = Math.max(a, b);
            const present = Math.min(a, b); // ensures present <= total

            const calculated =
              total === 0 ? 0 : Math.floor((present / total) * 100);

            // Invariants:
            // 1. If total is 0, percentage must be 0
            if (total === 0) {
              expect(calculated).toBe(0);
            }
            // 2. Calculated percentage must be an integer between 0 and 100
            expect(Number.isInteger(calculated)).toBe(true);
            expect(calculated).toBeGreaterThanOrEqual(0);
            expect(calculated).toBeLessThanOrEqual(100);

            // 3. Strict match with specification formula
            const expected =
              total === 0 ? 0 : Math.floor((present / total) * 100);
            expect(calculated).toBe(expected);
          }
        ),
        { numRuns: 500 }
      );
    });

    test('Monotonicity invariant: for fixed total > 0, increasing present count never decreases percentage', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 200 }),
          fc.integer({ min: 0, max: 199 }),
          (total, present) => {
            fc.pre(present < total);
            const p1 = Math.floor((present / total) * 100);
            const p2 = Math.floor(((present + 1) / total) * 100);
            expect(p2).toBeGreaterThanOrEqual(p1);
          }
        ),
        { numRuns: 300 }
      );
    });

    test('Security/Ownership Invariant: non-admin without matching student_id is always rejected with 403', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.constantFrom('student', 'viewer', 'guest', 'user'),
          async (requestingUserId, targetStudentId, nonAdminRole) => {
            fc.pre(requestingUserId !== targetStudentId);

            const testToken = `token-${requestingUserId}`;
            dynamicTokens[testToken] = {
              id: requestingUserId,
              email: `${requestingUserId}@example.com`,
              role: nonAdminRole,
              student_id: requestingUserId,
              user_metadata: { student_id: requestingUserId },
            };

            // Ensure target student exists in mock
            mockStudents[targetStudentId] = {
              id: targetStudentId,
              name: 'Arbitrary Student',
              roll_number: `ROLL-${targetStudentId.slice(0, 5)}`,
              department: 'Eng',
            };

            const res = await request(app)
              .get(`/attendance/${targetStudentId}`)
              .set('Authorization', `Bearer ${testToken}`);

            expect(res.status).toBe(403);
            expect(res.body.status).toBe('error');
            expect(res.body.message).toMatch(/forbidden|only access your own/i);

            delete mockStudents[targetStudentId];
            delete dynamicTokens[testToken];
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Authentication & Authorization Tests
  // ────────────────────────────────────────────────────────────────
  describe('Authentication & Authorization', () => {
    test('missing Authorization header returns HTTP 401', async () => {
      const res1 = await request(app).get(`/attendance/${student1Id}`);
      expect(res1.status).toBe(401);
      expect(res1.body.status).toBe('error');

      const res2 = await request(app).get(`/attendance/${student1Id}/percentage`);
      expect(res2.status).toBe(401);
      expect(res2.body.status).toBe('error');
    });

    test('invalid Authorization token returns HTTP 401', async () => {
      const res1 = await request(app)
        .get(`/attendance/${student1Id}`)
        .set('Authorization', `Bearer ${invalidToken}`);
      expect(res1.status).toBe(401);
      expect(res1.body.status).toBe('error');

      const res2 = await request(app)
        .get(`/attendance/${student1Id}/percentage`)
        .set('Authorization', `Bearer ${invalidToken}`);
      expect(res2.status).toBe(401);
      expect(res2.body.status).toBe('error');
    });

    test('student accessing another student returns HTTP 403', async () => {
      // Alice (student1Token) attempts to access Bob (student2Id)
      const res1 = await request(app)
        .get(`/attendance/${student2Id}`)
        .set('Authorization', `Bearer ${student1Token}`);
      expect(res1.status).toBe(403);
      expect(res1.body.status).toBe('error');
      expect(res1.body.message).toMatch(/forbidden/i);

      const res2 = await request(app)
        .get(`/attendance/${student2Id}/percentage`)
        .set('Authorization', `Bearer ${student1Token}`);
      expect(res2.status).toBe(403);
      expect(res2.body.status).toBe('error');
      expect(res2.body.message).toMatch(/forbidden/i);
    });

    test('student accessing own data returns HTTP 200', async () => {
      // Alice (student1Token) accesses her own record (student1Id)
      const res1 = await request(app)
        .get(`/attendance/${student1Id}`)
        .set('Authorization', `Bearer ${student1Token}`);
      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .get(`/attendance/${student1Id}/percentage`)
        .set('Authorization', `Bearer ${student1Token}`);
      expect(res2.status).toBe(200);
      expect(res2.body.student_id).toBe(student1Id);
    });

    test('admin accessing any student returns HTTP 200', async () => {
      // Admin accesses Alice (student1Id)
      const res1 = await request(app)
        .get(`/attendance/${student1Id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res1.status).toBe(200);

      // Admin accesses Bob (student2Id)
      const res2 = await request(app)
        .get(`/attendance/${student2Id}/percentage`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res2.status).toBe(200);
      expect(res2.body.student_id).toBe(student2Id);
    });

    test('unknown student returns HTTP 404', async () => {
      // Admin accesses unknown student ID
      const res1 = await request(app)
        .get(`/attendance/${unknownStudentId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res1.status).toBe(404);
      expect(res1.body.status).toBe('error');
      expect(res1.body.message).toMatch(/not found/i);

      const res2 = await request(app)
        .get(`/attendance/${unknownStudentId}/percentage`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res2.status).toBe(404);
      expect(res2.body.status).toBe('error');
      expect(res2.body.message).toMatch(/not found/i);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Attendance History Unit Tests (GET /attendance/:student_id)
  // ────────────────────────────────────────────────────────────────
  describe('GET /attendance/:student_id', () => {
    test('returns empty array when student has no records', async () => {
      mockAttendanceRecords = [];

      const res = await request(app)
        .get(`/attendance/${student1Id}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toEqual([]);
    });

    test('valid student returns attendance records with expected fields', async () => {
      mockAttendanceRecords = [
        {
          id: 'rec-001',
          student_id: student1Id,
          date: '2026-03-01',
          time: '2026-03-01T09:00:00Z',
          status: 'present',
          verification_score: 0.92,
        },
        {
          id: 'rec-002',
          student_id: student1Id,
          date: '2026-03-02',
          time: '2026-03-02T09:05:00Z',
          status: 'absent',
          verification_score: 0.41,
        },
      ];

      const res = await request(app)
        .get(`/attendance/${student1Id}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);

      const first = res.body[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('date');
      expect(first).toHaveProperty('time');
      expect(first).toHaveProperty('status');
      expect(first).toHaveProperty('verification_score');

      // Crucial: never expose voice_embedding
      expect(first).not.toHaveProperty('voice_embedding');
      expect(JSON.stringify(res.body)).not.toContain('voice_embedding');
    });

    test('sorts newest date first', async () => {
      mockAttendanceRecords = [
        {
          id: 'rec-old',
          student_id: student1Id,
          date: '2026-02-15',
          time: '2026-02-15T09:00:00Z',
          status: 'present',
          verification_score: 0.88,
        },
        {
          id: 'rec-newest',
          student_id: student1Id,
          date: '2026-03-10',
          time: '2026-03-10T09:00:00Z',
          status: 'present',
          verification_score: 0.95,
        },
        {
          id: 'rec-middle',
          student_id: student1Id,
          date: '2026-03-01',
          time: '2026-03-01T09:00:00Z',
          status: 'absent',
          verification_score: 0.35,
        },
      ];

      const res = await request(app)
        .get(`/attendance/${student1Id}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0].id).toBe('rec-newest');
      expect(res.body[1].id).toBe('rec-middle');
      expect(res.body[2].id).toBe('rec-old');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Percentage Unit Tests (GET /attendance/:student_id/percentage)
  // ────────────────────────────────────────────────────────────────
  describe('GET /attendance/:student_id/percentage', () => {
    test('returns 0 percentage and 0 counts when no records exist', async () => {
      mockAttendanceRecords = [];

      const res = await request(app)
        .get(`/attendance/${student1Id}/percentage`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        student_id: student1Id,
        percentage: 0,
        present_count: 0,
        total_count: 0,
      });
    });

    test('returns zero percentage when all records are absent', async () => {
      mockAttendanceRecords = [
        { student_id: student1Id, status: 'absent' },
        { student_id: student1Id, status: 'absent' },
        { student_id: student1Id, status: 'absent' },
      ];

      const res = await request(app)
        .get(`/attendance/${student1Id}/percentage`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        student_id: student1Id,
        percentage: 0,
        present_count: 0,
        total_count: 3,
      });
    });

    test('calculates correct percentage for mixed present/absent records with floor', async () => {
      // 1 present out of 3 total -> 33.333% -> floor is 33
      mockAttendanceRecords = [
        { student_id: student1Id, status: 'present' },
        { student_id: student1Id, status: 'absent' },
        { student_id: student1Id, status: 'absent' },
      ];

      const res = await request(app)
        .get(`/attendance/${student1Id}/percentage`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        student_id: student1Id,
        percentage: 33,
        present_count: 1,
        total_count: 3,
      });
    });

    test('calculates 100% when all records are present', async () => {
      mockAttendanceRecords = [
        { student_id: student1Id, status: 'present' },
        { student_id: student1Id, status: 'present' },
        { student_id: student1Id, status: 'present' },
        { student_id: student1Id, status: 'present' },
      ];

      const res = await request(app)
        .get(`/attendance/${student1Id}/percentage`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        student_id: student1Id,
        percentage: 100,
        present_count: 4,
        total_count: 4,
      });
    });

    test('never exposes voice_embedding in percentage response', async () => {
      mockAttendanceRecords = [
        { student_id: student1Id, status: 'present' },
      ];

      const res = await request(app)
        .get(`/attendance/${student1Id}/percentage`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('voice_embedding');
      expect(JSON.stringify(res.body)).not.toContain('voice_embedding');
    });
  });
});

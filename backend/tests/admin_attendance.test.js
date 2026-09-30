/**
 * TASK 5: GET /admin/attendance Test Suite
 * =========================================
 * Tests:
 *   GET /admin/attendance
 *
 * Requirements:
 *   - Admin authentication required (401 on missing/invalid, 403 on non-admin)
 *   - Return up to 1000 records
 *   - Join attendance records with student information:
 *     id, student_id, student_name, roll_number, date, time, status, verification_score
 *   - Sort by date descending and time descending
 *   - Optional filters: student_id, date, and combined
 *   - Invalid student_id format returns 400 with "Invalid student_id format."
 *   - Invalid date format returns 400 with "Invalid date format. Use YYYY-MM-DD."
 *   - No matches returns 200 with []
 *   - Never expose voice_embedding
 *
 * Includes:
 *   - Property tests for filtering and sorting (fast-check)
 *   - Comprehensive unit tests covering all required edge cases
 */

const request = require('supertest');
const fc = require('fast-check');
const app = require('../src/index');
const { supabase } = require('../src/supabaseClient');

jest.setTimeout(25000);

describe('TASK 5: GET /admin/attendance', () => {
  const adminToken = 'task5-admin-token';
  const studentToken = 'task5-student-token';
  const invalidToken = 'task5-invalid-token';

  const student1Id = '11111111-1111-4111-8111-111111111111';
  const student2Id = '22222222-2222-4222-8222-222222222222';

  const mockStudents = {
    [student1Id]: {
      id: student1Id,
      name: 'Alice Cooper',
      roll_number: 'CS-101',
      department: 'Computer Science',
      voice_embedding: [0.1, 0.2, 0.3], // Must never be exposed
    },
    [student2Id]: {
      id: student2Id,
      name: 'Bob Marley',
      roll_number: 'CS-102',
      department: 'IT',
      voice_embedding: [0.4, 0.5, 0.6], // Must never be exposed
    },
  };

  let mockAttendanceRecords = [];

  beforeAll(() => {
    // 1. Mock supabase.auth.getUser
    jest.spyOn(supabase.auth, 'getUser').mockImplementation(async (token) => {
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
      if (token === studentToken) {
        return {
          data: {
            user: {
              id: student1Id,
              email: 'student@school.edu',
              role: 'student',
              user_metadata: { role: 'student', student_id: student1Id },
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

    // 2. Mock supabase.from
    const originalFrom = supabase.from.bind(supabase);
    jest.spyOn(supabase, 'from').mockImplementation((table) => {
      if (table === 'admins') {
        return {
          select: (fields) => ({
            eq: (col, val) => ({
              single: async () => {
                if (val === '00000000-0000-4000-8000-000000000001') {
                  return { data: { id: val, role: 'admin' }, error: null };
                }
                return { data: null, error: new Error('Not an admin') };
              },
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

      if (table === 'students') {
        return {
          select: (fields) => ({
            in: (col, vals) => {
              const matches = (vals || []).map((id) => {
                const s = mockStudents[id];
                if (!s) return null;
                return { id: s.id, name: s.name, roll_number: s.roll_number };
              }).filter(Boolean);
              return Promise.resolve({ data: matches, error: null });
            },
            eq: (col, val) => ({
              maybeSingle: async () => {
                const s = mockStudents[val];
                if (!s) return { data: null, error: null };
                return { data: { id: s.id, name: s.name, roll_number: s.roll_number }, error: null };
              },
            }),
          }),
        };
      }

      if (table === 'attendance') {
        return {
          select: (fields) => {
            let data = [...mockAttendanceRecords];

            const builder = {
              order: (field, opts) => {
                data.sort((a, b) => {
                  const valA = a[field] || '';
                  const valB = b[field] || '';
                  return opts?.ascending
                    ? String(valA).localeCompare(String(valB))
                    : String(valB).localeCompare(String(valA));
                });
                return builder;
              },
              eq: (col, val) => {
                data = data.filter((r) => r[col] === val);
                return builder;
              },
              gte: (col, val) => {
                data = data.filter((r) => r[col] >= val);
                return builder;
              },
              lte: (col, val) => {
                data = data.filter((r) => r[col] <= val);
                return builder;
              },
              limit: (n) => {
                data = data.slice(0, n);
                return builder;
              },
              then: (resolve) => {
                resolve({ data: [...data], error: null });
              },
            };

            return builder;
          },
        };
      }

      return originalFrom(table);
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    mockAttendanceRecords = [
      {
        id: 'rec-1',
        student_id: student1Id,
        date: '2026-03-10',
        time: '2026-03-10T09:00:00Z',
        status: 'present',
        verification_score: 0.95,
      },
      {
        id: 'rec-2',
        student_id: student1Id,
        date: '2026-03-11',
        time: '2026-03-11T09:05:00Z',
        status: 'absent',
        verification_score: 0.45,
      },
      {
        id: 'rec-3',
        student_id: student2Id,
        date: '2026-03-10',
        time: '2026-03-10T09:02:00Z',
        status: 'present',
        verification_score: 0.89,
      },
      {
        id: 'rec-4',
        student_id: student2Id,
        date: '2026-03-12',
        time: '2026-03-12T09:10:00Z',
        status: 'present',
        verification_score: 0.91,
      },
    ];
  });

  // ────────────────────────────────────────────────────────────────
  // Property-Based Tests (fast-check)
  // ────────────────────────────────────────────────────────────────
  describe('Property-Based Tests (fast-check)', () => {
    test('Filtering and sorting invariants: filters match strictly and results are sorted date desc, time desc', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('none', 'by_student', 'by_date', 'combined'),
          async (filterMode) => {
            let url = '/admin/attendance';
            const params = [];
            if (filterMode === 'by_student') params.push(`student_id=${student1Id}`);
            if (filterMode === 'by_date') params.push('date=2026-03-10');
            if (filterMode === 'combined') {
              params.push(`student_id=${student2Id}`);
              params.push('date=2026-03-10');
            }
            if (params.length > 0) url += `?${params.join('&')}`;

            const res = await request(app)
              .get(url)
              .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);

            // Invariant 1: Check filters
            for (const r of res.body) {
              if (filterMode === 'by_student') {
                expect(r.student_id).toBe(student1Id);
              }
              if (filterMode === 'by_date') {
                expect(r.date).toBe('2026-03-10');
              }
              if (filterMode === 'combined') {
                expect(r.student_id).toBe(student2Id);
                expect(r.date).toBe('2026-03-10');
              }

              // Invariant 2: Required joined fields exist
              expect(r).toHaveProperty('id');
              expect(r).toHaveProperty('student_id');
              expect(r).toHaveProperty('student_name');
              expect(r).toHaveProperty('roll_number');
              expect(r).toHaveProperty('date');
              expect(r).toHaveProperty('time');
              expect(r).toHaveProperty('status');
              expect(r).toHaveProperty('verification_score');

              // Invariant 3: voice_embedding is NEVER exposed
              expect(r).not.toHaveProperty('voice_embedding');
            }

            // Invariant 4: Sorting invariant (date descending, then time descending)
            for (let i = 0; i < res.body.length - 1; i++) {
              const curr = res.body[i];
              const next = res.body[i + 1];
              if (curr.date === next.date) {
                expect(curr.time >= next.time).toBe(true);
              } else {
                expect(curr.date >= next.date).toBe(true);
              }
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Authentication & Authorization Tests
  // ────────────────────────────────────────────────────────────────
  describe('Authentication & Authorization', () => {
    test('missing Authorization header returns HTTP 401', async () => {
      const res = await request(app).get('/admin/attendance');
      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
    });

    test('invalid Authorization token returns HTTP 401', async () => {
      const res = await request(app)
        .get('/admin/attendance')
        .set('Authorization', `Bearer ${invalidToken}`);
      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
    });

    test('non-admin user returns HTTP 403', async () => {
      const res = await request(app)
        .get('/admin/attendance')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Input Validation Tests
  // ────────────────────────────────────────────────────────────────
  describe('Input Validation', () => {
    test('invalid UUID format returns HTTP 400 with expected message', async () => {
      const res = await request(app)
        .get('/admin/attendance?student_id=invalid-uuid-123')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('Invalid student_id format.');
    });

    test('invalid date format returns HTTP 400 with expected message', async () => {
      const invalidDates = ['2026/03/10', '10-03-2026', 'not-a-date', '2026-13-45'];
      for (const d of invalidDates) {
        const res = await request(app)
          .get(`/admin/attendance?date=${d}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.status).toBe('error');
        expect(res.body.message).toBe('Invalid date format. Use YYYY-MM-DD.');
      }
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Filtering & Result Set Tests
  // ────────────────────────────────────────────────────────────────
  describe('Filtering & Retrieval', () => {
    test('all logs: returns all records joined with student name and roll_number, sorted newest date first', async () => {
      const res = await request(app)
        .get('/admin/attendance')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(4);

      // Verify joined fields
      const first = res.body[0];
      expect(first.date).toBe('2026-03-12');
      expect(first.student_name).toBe('Bob Marley');
      expect(first.roll_number).toBe('CS-102');
      expect(first).not.toHaveProperty('voice_embedding');
    });

    test('student filter: returns only records for specified student_id', async () => {
      const res = await request(app)
        .get(`/admin/attendance?student_id=${student1Id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.every((r) => r.student_id === student1Id)).toBe(true);
      expect(res.body.every((r) => r.student_name === 'Alice Cooper')).toBe(true);
      expect(res.body.every((r) => r.roll_number === 'CS-101')).toBe(true);
    });

    test('date filter: returns only records on specified date', async () => {
      const res = await request(app)
        .get('/admin/attendance?date=2026-03-10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.every((r) => r.date === '2026-03-10')).toBe(true);
    });

    test('combined filters: returns records matching both student_id and date', async () => {
      const res = await request(app)
        .get(`/admin/attendance?student_id=${student1Id}&date=2026-03-10`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('rec-1');
      expect(res.body[0].student_id).toBe(student1Id);
      expect(res.body[0].date).toBe('2026-03-10');
    });

    test('empty result: returns HTTP 200 with empty array when no records match', async () => {
      const res = await request(app)
        .get('/admin/attendance?date=2026-01-01')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toEqual([]);
    });

    test('1000-record limit: limits maximum returned records to 1000', async () => {
      // Generate 1050 records
      const bigList = [];
      for (let i = 0; i < 1050; i++) {
        bigList.push({
          id: `rec-bulk-${i}`,
          student_id: student1Id,
          date: '2026-03-01',
          time: '2026-03-01T09:00:00Z',
          status: 'present',
          verification_score: 0.9,
        });
      }
      mockAttendanceRecords = bigList;

      const res = await request(app)
        .get('/admin/attendance')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1000);
    });
  });
});

/**
 * TASK 4: PUT /admin/students/:id Test Suite
 * ===========================================
 * Tests:
 *   PUT /admin/students/:id
 *
 * Requirements:
 *   - Authentication required (401 on missing/invalid JWT)
 *   - Admin role required (403 on non-admin)
 *   - Unknown student returns 404 with "Student not found."
 *   - Allowed fields: name (1-100), roll_number (1-50), department (0-100, optional)
 *   - Only supplied fields are updated; unspecified fields are preserved
 *   - Reject invalid/empty update bodies with 400
 *   - Duplicate roll number returns 409 with "A student with this roll number already exists."
 *   - Successful response: id, name, roll_number, department, voice_enrolled, created_at
 *   - Never return voice_embedding
 *
 * Includes:
 *   - Property tests for partial update isolation (fast-check)
 *   - Comprehensive unit tests covering all required edge cases
 */

const request = require('supertest');
const fc = require('fast-check');
const app = require('../src/index');
const { supabase } = require('../src/supabaseClient');

jest.setTimeout(25000);

describe('TASK 4: PUT /admin/students/:id', () => {
  const adminToken = 'task4-admin-token';
  const studentToken = 'task4-student-token';
  const invalidToken = 'task4-invalid-token';

  const studentAId = '11111111-1111-4111-8111-111111111111';
  const studentBId = '22222222-2222-4222-8222-222222222222';
  const unknownStudentId = '99999999-9999-4999-8999-999999999999';

  let mockStudents = {};

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
              id: studentAId,
              email: 'student@school.edu',
              role: 'student',
              user_metadata: { role: 'student', student_id: studentAId },
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
          // Select mock
          select: (fields) => ({
            eq: (col, val) => ({
              neq: (neqCol, neqVal) => ({
                maybeSingle: async () => {
                  const found = Object.values(mockStudents).find(
                    (s) => s[col] === val && s[neqCol] !== neqVal
                  );
                  return { data: found || null, error: null };
                },
              }),
              maybeSingle: async () => {
                const s = mockStudents[val];
                if (!s) return { data: null, error: null };
                return { data: { ...s }, error: null };
              },
            }),
          }),
          // Update mock
          update: (updates) => ({
            eq: (col, val) => ({
              select: (fields) => ({
                single: async () => {
                  const s = mockStudents[val];
                  if (!s) return { data: null, error: new Error('Student not found') };
                  // Apply partial updates
                  Object.assign(s, updates);
                  return { data: { ...s }, error: null };
                },
              }),
            }),
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
    // Reset test fixtures
    mockStudents = {
      [studentAId]: {
        id: studentAId,
        name: 'Alice Cooper',
        roll_number: 'CS-101',
        department: 'Computer Science',
        voice_embedding: [0.1, 0.2, 0.3], // Enrolled
        created_at: '2026-01-15T08:00:00Z',
      },
      [studentBId]: {
        id: studentBId,
        name: 'Bob Marley',
        roll_number: 'CS-102',
        department: 'Information Technology',
        voice_embedding: null, // Not enrolled
        created_at: '2026-01-16T09:00:00Z',
      },
    };
  });

  // ────────────────────────────────────────────────────────────────
  // Property-Based Tests (fast-check)
  // ────────────────────────────────────────────────────────────────
  describe('Property-Based Tests (fast-check)', () => {
    test('Partial update isolation: updating a subset of fields preserves all unmentioned fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Valid name generator: 1–100 non-whitespace string
          fc.string({ minLength: 1, maxLength: 80 }).map((s) => 'N_' + s.trim()).filter((s) => s.length >= 1 && s.length <= 100),
          // Valid roll generator: 1–40 non-whitespace string
          fc.string({ minLength: 1, maxLength: 30 }).map((s) => 'R_' + s.replace(/\s+/g, '_')).filter((s) => s.length >= 1 && s.length <= 50),
          // Valid department generator: 0–80 chars
          fc.string({ minLength: 0, maxLength: 80 }).map((s) => s.trim()),
          // Field selection: which field(s) to update
          fc.constantFrom('name_only', 'roll_only', 'dept_only'),
          async (newName, newRoll, newDept, scenario) => {
            const originalStudent = {
              id: 'prop-student-uuid',
              name: 'Original Name',
              roll_number: 'ORIG-ROLL-001',
              department: 'Original Department',
              voice_embedding: [0.5, 0.6],
              created_at: '2026-01-01T00:00:00Z',
            };
            mockStudents['prop-student-uuid'] = { ...originalStudent };

            let payload = {};
            if (scenario === 'name_only') payload = { name: newName };
            if (scenario === 'roll_only') payload = { roll_number: newRoll };
            if (scenario === 'dept_only') payload = { department: newDept };

            const res = await request(app)
              .put('/admin/students/prop-student-uuid')
              .set('Authorization', `Bearer ${adminToken}`)
              .send(payload);

            expect(res.status).toBe(200);

            // Invariant: Unmentioned fields MUST match original
            if (scenario === 'name_only') {
              expect(res.body.name).toBe(newName);
              expect(res.body.roll_number).toBe(originalStudent.roll_number);
              expect(res.body.department).toBe(originalStudent.department);
            } else if (scenario === 'roll_only') {
              expect(res.body.roll_number).toBe(newRoll);
              expect(res.body.name).toBe(originalStudent.name);
              expect(res.body.department).toBe(originalStudent.department);
            } else if (scenario === 'dept_only') {
              expect(res.body.department).toBe(newDept);
              expect(res.body.name).toBe(originalStudent.name);
              expect(res.body.roll_number).toBe(originalStudent.roll_number);
            }

            // Invariant: voice_embedding is never returned
            expect(res.body).not.toHaveProperty('voice_embedding');
            expect(JSON.stringify(res.body)).not.toContain('voice_embedding');

            // Invariant: voice_enrolled correctly reflects presence of voice_embedding
            expect(res.body.voice_enrolled).toBe(true);

            delete mockStudents['prop-student-uuid'];
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Authentication & Authorization Tests
  // ────────────────────────────────────────────────────────────────
  describe('Authentication & Authorization', () => {
    test('missing Authorization header returns HTTP 401', async () => {
      const res = await request(app)
        .put(`/admin/students/${studentAId}`)
        .send({ name: 'Valid Name' });

      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
    });

    test('invalid Authorization token returns HTTP 401', async () => {
      const res = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${invalidToken}`)
        .send({ name: 'Valid Name' });

      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
    });

    test('non-admin user returns HTTP 403', async () => {
      const res = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ name: 'Attempted Update' });

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toMatch(/privileges|forbidden|admin/i);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Input Validation Tests
  // ────────────────────────────────────────────────────────────────
  describe('Input Validation', () => {
    test('rejects empty request body with HTTP 400', async () => {
      const res = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });

    test('rejects body with only unrecognized fields with HTTP 400', async () => {
      const res = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ unknown_field: 'hello', another: 123 });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });

    test('rejects empty name or whitespace-only name with HTTP 400', async () => {
      const res1 = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '' });
      expect(res1.status).toBe(400);
      expect(res1.body.message).toMatch(/name/i);

      const res2 = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '     ' });
      expect(res2.status).toBe(400);
      expect(res2.body.message).toMatch(/name/i);
    });

    test('rejects name exceeding 100 characters with HTTP 400', async () => {
      const longName = 'A'.repeat(101);
      const res = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: longName });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/name/i);
    });

    test('rejects non-string name with HTTP 400', async () => {
      const res = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/name/i);
    });

    test('rejects empty roll_number or whitespace-only roll_number with HTTP 400', async () => {
      const res1 = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roll_number: '' });
      expect(res1.status).toBe(400);
      expect(res1.body.message).toMatch(/roll number/i);

      const res2 = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roll_number: '   ' });
      expect(res2.status).toBe(400);
      expect(res2.body.message).toMatch(/roll number/i);
    });

    test('rejects roll_number exceeding 50 characters with HTTP 400', async () => {
      const longRoll = 'R'.repeat(51);
      const res = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roll_number: longRoll });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/roll number/i);
    });

    test('rejects department exceeding 100 characters with HTTP 400', async () => {
      const longDept = 'D'.repeat(101);
      const res = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ department: longDept });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/department/i);
    });

    test('accepts null or empty department as optional', async () => {
      const res = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ department: null });

      expect(res.status).toBe(200);
      expect(res.body.department).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Unknown Student & Conflict Tests
  // ────────────────────────────────────────────────────────────────
  describe('Unknown Student & Conflict Checks', () => {
    test('returns HTTP 404 with "Student not found." for unknown student', async () => {
      const res = await request(app)
        .put(`/admin/students/${unknownStudentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Name' });

      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('Student not found.');
    });

    test('duplicate roll number returns HTTP 409 with exact message', async () => {
      // Student A attempts to take Student B's roll number ('CS-102')
      const res = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roll_number: 'CS-102' });

      expect(res.status).toBe(409);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('A student with this roll number already exists.');
    });

    test('updating to the student’s own current roll number is allowed (HTTP 200)', async () => {
      // Student A submits the same roll number ('CS-101')
      const res = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roll_number: 'CS-101' });

      expect(res.status).toBe(200);
      expect(res.body.roll_number).toBe('CS-101');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Successful Updates & Partial Field Updates
  // ────────────────────────────────────────────────────────────────
  describe('Successful Updates', () => {
    test('updating only one field (name) preserves all other fields', async () => {
      const res = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Alice New' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(studentAId);
      expect(res.body.name).toBe('Alice New');
      expect(res.body.roll_number).toBe('CS-101'); // Preserved
      expect(res.body.department).toBe('Computer Science'); // Preserved
      expect(res.body.voice_enrolled).toBe(true);
      expect(res.body.created_at).toBe('2026-01-15T08:00:00Z');
      expect(res.body).not.toHaveProperty('voice_embedding');
    });

    test('updating only one field (roll_number) preserves name and department', async () => {
      const res = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roll_number: 'CS-999' });

      expect(res.status).toBe(200);
      expect(res.body.roll_number).toBe('CS-999');
      expect(res.body.name).toBe('Alice Cooper'); // Preserved
      expect(res.body.department).toBe('Computer Science'); // Preserved
    });

    test('updating only one field (department) preserves name and roll_number', async () => {
      const res = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ department: 'Data Science' });

      expect(res.status).toBe(200);
      expect(res.body.department).toBe('Data Science');
      expect(res.body.name).toBe('Alice Cooper'); // Preserved
      expect(res.body.roll_number).toBe('CS-101'); // Preserved
    });

    test('updating multiple fields simultaneously', async () => {
      const res = await request(app)
        .put(`/admin/students/${studentAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Alice Wonder',
          roll_number: 'CS-777',
          department: 'AI & Robotics',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Alice Wonder');
      expect(res.body.roll_number).toBe('CS-777');
      expect(res.body.department).toBe('AI & Robotics');
      expect(res.body.voice_enrolled).toBe(true);
      expect(res.body).not.toHaveProperty('voice_embedding');
    });

    test('correctly reflects voice_enrolled as false when voice_embedding is null', async () => {
      const res = await request(app)
        .put(`/admin/students/${studentBId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bob Updated' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(studentBId);
      expect(res.body.name).toBe('Bob Updated');
      expect(res.body.voice_enrolled).toBe(false);
      expect(res.body).not.toHaveProperty('voice_embedding');
    });
  });
});

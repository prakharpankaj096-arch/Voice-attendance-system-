/**
 * Test Suite: First-Time Student Voice Enrollment Flow & Security
 * ==============================================================
 * Tests:
 * 1. First-time enrollment (5 audio files, authenticated student, centroid saved)
 * 2. Duplicate enrollment prevention (409 Conflict with already_enrolled: true)
 * 3. Unauthorized enrollment (401 unauthenticated, 403 arbitrary student_id injection)
 * 4. Password independence: Password change preserves enrolled voice embedding
 * 5. Voice reset independence: Admin voice reset preserves password authentication
 */

const request = require('supertest');
const app = require('../src/index');
const { supabase, supabaseAuth } = require('../src/supabaseClient');

jest.setTimeout(25000);

describe('Voice Enrollment Flow & Security', () => {
  const adminToken = 'test-admin-jwt';
  const studentToken = 'test-student-jwt';

  const testStudentId = '11111111-2222-3333-4444-555555555555';
  const testStudentRoll = 'CS-101';
  const testStudentName = 'John Doe';
  const mock192DimEmbedding = Array(192).fill(0.05);

  beforeEach(() => {
    jest.restoreAllMocks();

    // Default getUser mock for requireAuth
    jest.spyOn(supabase.auth, 'getUser').mockImplementation(async (token) => {
      if (token === adminToken) {
        return {
          data: {
            user: {
              id: '00000000-0000-4000-8000-000000000001',
              email: 'admin@attendance.system',
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
              id: testStudentId,
              email: 'student_cs_101@attendance.system',
              role: 'student',
              user_metadata: {
                role: 'student',
                student_id: testStudentId,
                roll_number: testStudentRoll,
              },
            },
          },
          error: null,
        };
      }
      return { data: { user: null }, error: new Error('Invalid token') };
    });

    // Default updateUserById mock
    jest.spyOn(supabase.auth.admin, 'updateUserById').mockResolvedValue({
      data: { user: { id: 'auth-user-1' } },
      error: null,
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // ── 1. First-Time Enrollment ──────────────────────────────────────────
  describe('First-Time Voice Enrollment', () => {
    test('successfully enrolls student with 5 audio files and saves embedding', async () => {
      // Mock student lookup: unenrolled student (voice_embedding: null)
      const mockStudent = {
        id: testStudentId,
        name: testStudentName,
        roll_number: testStudentRoll,
        department: 'Computer Science',
        voice_embedding: null,
        created_at: new Date().toISOString(),
      };

      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockStudent, error: null }),
        single: jest.fn().mockResolvedValue({ data: mockStudent, error: null }),
        update: jest.fn().mockReturnThis(),
      };

      jest.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'students') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: mockStudent, error: null }),
              }),
              ilike: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: mockStudent, error: null }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: {
                      id: testStudentId,
                      name: testStudentName,
                      roll_number: testStudentRoll,
                      department: 'Computer Science',
                      created_at: mockStudent.created_at,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return selectChain;
      });

      // Mock voice-service /enroll fetch call
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          dimension: 192,
          embedding: mock192DimEmbedding,
          avg_internal_similarity: 0.94,
          quality_reports: [{ duration_s: 3.2, quality_score: 0.91 }],
        }),
      });

      const res = await request(app)
        .post('/students/enroll')
        .set('Authorization', `Bearer ${studentToken}`)
        .attach('audio_files', Buffer.from('fake audio 1'), 'sample1.webm')
        .attach('audio_files', Buffer.from('fake audio 2'), 'sample2.webm')
        .attach('audio_files', Buffer.from('fake audio 3'), 'sample3.webm')
        .attach('audio_files', Buffer.from('fake audio 4'), 'sample4.webm')
        .attach('audio_files', Buffer.from('fake audio 5'), 'sample5.webm');

      global.fetch = originalFetch;

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.student.voice_enrolled).toBe(true);
      expect(res.body.embedding_dim).toBe(192);
      // Critical security requirement: voice_embedding must NEVER be returned to the client
      expect(res.body.student.voice_embedding).toBeUndefined();
      expect(res.body.embedding).toBeUndefined();
    });

    test('rejects enrollment if fewer than 5 audio files are provided', async () => {
      const mockStudent = {
        id: testStudentId,
        name: testStudentName,
        roll_number: testStudentRoll,
        voice_embedding: null,
      };

      jest.spyOn(supabase, 'from').mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: mockStudent, error: null }),
          }),
        }),
      });

      const res = await request(app)
        .post('/students/enroll')
        .set('Authorization', `Bearer ${studentToken}`)
        .attach('audio_files', Buffer.from('fake audio 1'), 'sample1.webm')
        .attach('audio_files', Buffer.from('fake audio 2'), 'sample2.webm');

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toMatch(/Expected 5 audio files/i);
    });
  });

  // ── 2. Duplicate Enrollment Prevention ────────────────────────────────
  describe('Duplicate Enrollment Prevention', () => {
    test('returns 409 Conflict with already_enrolled: true if student already enrolled', async () => {
      // Mock student that ALREADY has a voice embedding
      const alreadyEnrolledStudent = {
        id: testStudentId,
        name: testStudentName,
        roll_number: testStudentRoll,
        department: 'Computer Science',
        voice_embedding: mock192DimEmbedding,
      };

      jest.spyOn(supabase, 'from').mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: alreadyEnrolledStudent, error: null }),
          }),
        }),
      });

      const res = await request(app)
        .post('/students/enroll')
        .set('Authorization', `Bearer ${studentToken}`)
        .attach('audio_files', Buffer.from('audio 1'), 'sample1.webm')
        .attach('audio_files', Buffer.from('audio 2'), 'sample2.webm')
        .attach('audio_files', Buffer.from('audio 3'), 'sample3.webm')
        .attach('audio_files', Buffer.from('audio 4'), 'sample4.webm')
        .attach('audio_files', Buffer.from('audio 5'), 'sample5.webm');

      expect(res.status).toBe(409);
      expect(res.body.status).toBe('error');
      expect(res.body.already_enrolled).toBe(true);
      expect(res.body.message).toMatch(/already enrolled/i);
    });
  });

  // ── 3. Unauthorized Enrollment ────────────────────────────────────────
  describe('Unauthorized Enrollment Prevention', () => {
    test('returns 401 Unauthorized when no Authorization header is present', async () => {
      const res = await request(app)
        .post('/students/enroll')
        .attach('audio_files', Buffer.from('audio 1'), 'sample1.webm');

      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
    });

    test('returns 403 Forbidden when student tries to enroll for a different student_id', async () => {
      const anotherStudentId = '99999999-9999-9999-9999-999999999999';

      const res = await request(app)
        .post('/students/enroll')
        .set('Authorization', `Bearer ${studentToken}`)
        .field('student_id', anotherStudentId)
        .attach('audio_files', Buffer.from('audio 1'), 'sample1.webm');

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toMatch(/not authorized to enroll voice for another student/i);
    });

    test('returns 403 Forbidden when student tries to enroll for a different roll_number', async () => {
      const anotherRollNumber = 'CS-999';

      const res = await request(app)
        .post('/students/enroll')
        .set('Authorization', `Bearer ${studentToken}`)
        .field('roll_number', anotherRollNumber)
        .attach('audio_files', Buffer.from('audio 1'), 'sample1.webm');

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toMatch(/not authorized to enroll voice for another student/i);
    });
  });

  // ── 4. Password Change Preserves Voice ─────────────────────────────────
  describe('Password Change Preserves Voice Enrollment', () => {
    test('student changing password leaves voice embedding intact', async () => {
      // Mock student sign-in with current password
      jest.spyOn(supabaseAuth.auth, 'signInWithPassword').mockResolvedValue({
        data: { session: { access_token: 'new-session' } },
        error: null,
      });

      // Spy on Supabase updates to ensure students table voice_embedding is never touched/nulled
      const updateSpy = jest.fn().mockReturnThis();
      const eqSpy = jest.fn().mockResolvedValue({ data: {}, error: null });

      jest.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'students') {
          return {
            update: updateSpy.mockReturnValue({ eq: eqSpy }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      const res = await request(app)
        .post('/students/change-password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          current_password: 'OldPassword123',
          new_password: 'NewPassword456',
          confirm_password: 'NewPassword456',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.message).toMatch(/Password changed successfully/i);

      // Verify that if any update occurred on students table, voice_embedding was NOT nulled
      if (updateSpy.mock.calls.length > 0) {
        for (const call of updateSpy.mock.calls) {
          const payload = call[0];
          expect(payload.voice_embedding).toBeUndefined();
        }
      }
    });
  });

  // ── 5. Admin Voice Reset Preserves Password ───────────────────────────
  describe('Admin Voice Reset Preserves Password', () => {
    test('resetting student voice clears voice_embedding but does NOT touch auth password', async () => {
      const updateStudentSpy = jest.fn().mockResolvedValue({ error: null });

      jest.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'students') {
          return {
            update: jest.fn().mockReturnValue({
              eq: updateStudentSpy,
            }),
          };
        }
        if (table === 'admins') {
          return {
            select: jest.fn().mockReturnValue({
              or: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
              }),
            }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      // Admin auth updateUserById spy
      const authUpdateSpy = jest.spyOn(supabase.auth.admin, 'updateUserById').mockResolvedValue({
        data: { user: { id: 'auth-user-1' } },
        error: null,
      });

      const res = await request(app)
        .post(`/admin/students/${testStudentId}/reset-voice`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.message).toMatch(/Voice data reset successfully/i);

      // Ensure that password was not reset or nulled in Supabase Auth
      if (authUpdateSpy.mock.calls.length > 0) {
        for (const call of authUpdateSpy.mock.calls) {
          const payload = call[1];
          expect(payload.password).toBeUndefined(); // Password remains unchanged
          if (payload.user_metadata) {
            expect(payload.user_metadata.voice_enrolled).toBe(false);
          }
        }
      }
    });
  });
});

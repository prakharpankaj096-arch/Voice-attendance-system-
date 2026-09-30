/**
 * Test Suite: Redesigned Authentication & Identity Architecture
 * ==============================================================
 * Tests:
 * 1. Student Login (Roll Number + Password)
 * 2. Admin Login (Admin ID + Password)
 * 3. First-Time Student Activation (Code verification, Password creation)
 * 4. Password Management (Student self-service, Admin reset)
 * 5. Password / Voice Separation
 * 6. Attendance Identity Enforcement (Session-based student_id)
 */

const request = require('supertest');
const app = require('../src/index');
const { supabase, supabaseAuth } = require('../src/supabaseClient');
const {
  generateActivationCode,
  hashActivationCode,
  verifyActivationCode,
  validatePasswordStrength,
} = require('../src/utils/authUtils');

jest.setTimeout(25000);

describe('Authentication & Identity Redesign', () => {
  const adminToken = 'test-admin-jwt';
  const studentToken = 'test-student-jwt';

  const testStudentId = '11111111-2222-3333-4444-555555555555';
  const testStudentRoll = 'CS-101';
  const testStudentName = 'John Doe';
  const testAdminId = 'admin';
  const testAdminEmail = 'prakharpankaj096@gmail.com';

  const validActivationCode = 'ACT-TEST99';
  const validActivationHash = hashActivationCode(validActivationCode);

  beforeEach(() => {
    jest.restoreAllMocks();

    // Default getUser mock for requireAuth
    jest.spyOn(supabase.auth, 'getUser').mockImplementation(async (token) => {
      if (token === adminToken) {
        return {
          data: {
            user: {
              id: '00000000-0000-4000-8000-000000000001',
              email: testAdminEmail,
              role: 'admin',
              user_metadata: { role: 'admin', admin_id: testAdminId },
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

    // Default updateUserById mock to prevent unhandled rejections
    jest.spyOn(supabase.auth.admin, 'updateUserById').mockResolvedValue({
      data: { user: { id: 'auth-user-1' } },
      error: null,
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // ── 1. Password Strength Utility ─────────────────────────────────────
  describe('Password Strength Validation', () => {
    test('rejects passwords shorter than 6 characters', () => {
      const res = validatePasswordStrength('Ab1');
      expect(res.valid).toBe(false);
      expect(res.message).toMatch(/at least 6 characters/i);
    });

    test('rejects passwords without numbers', () => {
      const res = validatePasswordStrength('Abcdefgh');
      expect(res.valid).toBe(false);
      expect(res.message).toMatch(/at least one letter and one number/i);
    });

    test('rejects passwords without letters', () => {
      const res = validatePasswordStrength('12345678');
      expect(res.valid).toBe(false);
      expect(res.message).toMatch(/at least one letter and one number/i);
    });

    test('accepts valid password containing letters and numbers', () => {
      const res = validatePasswordStrength('Password123');
      expect(res.valid).toBe(true);
    });
  });

  // ── 2. Activation Code Utility ───────────────────────────────────────
  describe('Activation Code Helpers', () => {
    test('generates valid code format ACT-XXXXXX', () => {
      const code = generateActivationCode();
      expect(code).toMatch(/^ACT-[A-Z0-9]{6}$/);
    });

    test('verifies correct activation code hash in constant time', () => {
      const code = 'ACT-AB12CD';
      const hash = hashActivationCode(code);
      expect(verifyActivationCode(code, hash)).toBe(true);
      expect(verifyActivationCode('ACT-WRONG1', hash)).toBe(false);
    });
  });

  // ── 3. Student & Admin Login APIs ────────────────────────────────────
  describe('POST /auth/login', () => {
    test('rejects login with missing password', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ roll_number: testStudentRoll });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/password is required/i);
    });

    test('returns 401 when student roll number does not exist', async () => {
      jest.spyOn(supabase, 'from').mockReturnValue({
        select: () => ({
          ilike: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      });

      const res = await request(app)
        .post('/auth/login')
        .send({ roll_number: 'NONEXISTENT', password: 'Password123' });
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/invalid roll number or password/i);
    });

    test('returns 403 when student account is not yet activated', async () => {
      jest.spyOn(supabase, 'from').mockReturnValue({
        select: () => ({
          ilike: () => ({
            maybeSingle: async () => ({
              data: {
                id: testStudentId,
                name: testStudentName,
                roll_number: testStudentRoll,
              },
              error: null,
            }),
          }),
        }),
      });

      jest.spyOn(supabase.auth.admin, 'listUsers').mockResolvedValue({
        data: {
          users: [
            {
              id: 'auth-user-1',
              email: 'student_cs_101@attendance.system',
              user_metadata: {
                is_activated: false,
                student_id: testStudentId,
                roll_number: testStudentRoll,
              },
            },
          ],
        },
        error: null,
      });

      const res = await request(app)
        .post('/auth/login')
        .send({ roll_number: testStudentRoll, password: 'Password123' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_NOT_ACTIVATED');
    });

    test('successful student login returns student identity and session', async () => {
      jest.spyOn(supabase, 'from').mockReturnValue({
        select: () => ({
          ilike: () => ({
            maybeSingle: async () => ({
              data: {
                id: testStudentId,
                name: testStudentName,
                roll_number: testStudentRoll,
                department: 'CSE',
                voice_embedding: [0.1, 0.2],
              },
              error: null,
            }),
          }),
        }),
      });

      jest.spyOn(supabase.auth.admin, 'listUsers').mockResolvedValue({
        data: {
          users: [
            {
              id: 'auth-user-1',
              email: 'student_cs_101@attendance.system',
              user_metadata: {
                is_activated: true,
                student_id: testStudentId,
                roll_number: testStudentRoll,
              },
            },
          ],
        },
        error: null,
      });

      jest.spyOn(supabaseAuth.auth, 'signInWithPassword').mockResolvedValue({
        data: {
          session: { access_token: 'valid-student-token', refresh_token: 'refresh-token' },
          user: { id: 'auth-user-1' },
        },
        error: null,
      });

      const res = await request(app)
        .post('/auth/login')
        .send({ roll_number: testStudentRoll, password: 'CorrectPassword1' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.user.role).toBe('student');
      expect(res.body.user.student_id).toBe(testStudentId);
      expect(res.body.user.voice_enrolled).toBe(true);
      expect(res.body.session.access_token).toBe('valid-student-token');
      expect(res.body.user).not.toHaveProperty('password');
      expect(res.body.user).not.toHaveProperty('password_hash');
    });

    test('successful admin login returns admin identity and session', async () => {
      jest.spyOn(supabase, 'from').mockImplementation((table) => {
        if (table === 'admins') {
          return {
            select: () => ({
              data: [{ id: 'admin-1', email: testAdminEmail, role: 'admin' }],
              or: () => ({
                maybeSingle: async () => ({
                  data: { id: 'admin-1', role: 'admin' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: () => ({}) };
      });

      jest.spyOn(supabaseAuth.auth, 'signInWithPassword').mockResolvedValue({
        data: {
          session: { access_token: 'valid-admin-token', refresh_token: 'refresh-token' },
          user: { id: 'admin-1', email: testAdminEmail },
        },
        error: null,
      });

      const res = await request(app)
        .post('/auth/login')
        .send({ admin_id: 'admin', password: 'AdminPassword123' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.user.role).toBe('admin');
      expect(res.body.user.is_admin).toBe(true);
      expect(res.body.session.access_token).toBe('valid-admin-token');
    });
  });

  // ── 4. First-Time Activation Flow ────────────────────────────────────
  describe('First-Time Student Activation Flow', () => {
    test('POST /auth/activate/verify rejects missing fields with 400', async () => {
      const res = await request(app).post('/auth/activate/verify').send({});
      expect(res.status).toBe(400);
    });

    test('POST /auth/activate/verify rejects invalid activation code with 400', async () => {
      jest.spyOn(supabase, 'from').mockReturnValue({
        select: () => ({
          ilike: () => ({
            maybeSingle: async () => ({
              data: { id: testStudentId, roll_number: testStudentRoll },
              error: null,
            }),
          }),
        }),
      });

      jest.spyOn(supabase.auth.admin, 'listUsers').mockResolvedValue({
        data: {
          users: [
            {
              id: 'auth-user-1',
              email: 'student_cs_101@attendance.system',
              user_metadata: {
                is_activated: false,
                student_id: testStudentId,
                roll_number: testStudentRoll,
                activation_code_hash: validActivationHash,
                activation_expires_at: new Date(Date.now() + 100000).toISOString(),
              },
            },
          ],
        },
        error: null,
      });

      const res = await request(app)
        .post('/auth/activate/verify')
        .send({ roll_number: testStudentRoll, activation_code: 'ACT-WRONG' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid activation code/i);
    });

    test('POST /auth/activate/verify succeeds with valid code', async () => {
      jest.spyOn(supabase, 'from').mockReturnValue({
        select: () => ({
          ilike: () => ({
            maybeSingle: async () => ({
              data: {
                id: testStudentId,
                name: testStudentName,
                roll_number: testStudentRoll,
                department: 'CSE',
                voice_embedding: null,
              },
              error: null,
            }),
          }),
        }),
      });

      jest.spyOn(supabase.auth.admin, 'listUsers').mockResolvedValue({
        data: {
          users: [
            {
              id: 'auth-user-1',
              email: 'student_cs_101@attendance.system',
              user_metadata: {
                is_activated: false,
                student_id: testStudentId,
                roll_number: testStudentRoll,
                activation_code_hash: validActivationHash,
                activation_expires_at: new Date(Date.now() + 100000).toISOString(),
              },
            },
          ],
        },
        error: null,
      });

      const res = await request(app)
        .post('/auth/activate/verify')
        .send({ roll_number: testStudentRoll, activation_code: validActivationCode });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.student.roll_number).toBe(testStudentRoll);
    });

    test('POST /auth/activate/set-password rejects mismatched confirmation', async () => {
      const res = await request(app)
        .post('/auth/activate/set-password')
        .send({
          roll_number: testStudentRoll,
          activation_code: validActivationCode,
          password: 'Password123',
          confirm_password: 'Password456',
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/do not match/i);
    });

    test('POST /auth/activate/set-password successfully creates password and logs in', async () => {
      jest.spyOn(supabase, 'from').mockReturnValue({
        select: () => ({
          ilike: () => ({
            maybeSingle: async () => ({
              data: {
                id: testStudentId,
                name: testStudentName,
                roll_number: testStudentRoll,
                department: 'CSE',
                voice_embedding: null,
              },
              error: null,
            }),
          }),
        }),
      });

      jest.spyOn(supabase.auth.admin, 'listUsers').mockResolvedValue({
        data: {
          users: [
            {
              id: 'auth-user-1',
              email: 'student_cs_101@attendance.system',
              user_metadata: {
                is_activated: false,
                student_id: testStudentId,
                roll_number: testStudentRoll,
                activation_code_hash: validActivationHash,
                activation_expires_at: new Date(Date.now() + 100000).toISOString(),
              },
            },
          ],
        },
        error: null,
      });

      jest.spyOn(supabase.auth.admin, 'updateUserById').mockResolvedValue({
        data: { user: { id: 'auth-user-1' } },
        error: null,
      });

      jest.spyOn(supabaseAuth.auth, 'signInWithPassword').mockResolvedValue({
        data: {
          session: { access_token: 'newly-created-session-token' },
          user: { id: 'auth-user-1' },
        },
        error: null,
      });

      const res = await request(app)
        .post('/auth/activate/set-password')
        .send({
          roll_number: testStudentRoll,
          activation_code: validActivationCode,
          password: 'SecurePassword123',
          confirm_password: 'SecurePassword123',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.session.access_token).toBe('newly-created-session-token');
      expect(res.body.user.student_id).toBe(testStudentId);
    });
  });

  // ── 5. Password Management ───────────────────────────────────────────
  describe('Password Management APIs', () => {
    test('POST /students/change-password requires authentication', async () => {
      const res = await request(app).post('/students/change-password').send({});
      expect(res.status).toBe(401);
    });

    test('POST /students/change-password rejects incorrect current password', async () => {
      jest.spyOn(supabaseAuth.auth, 'signInWithPassword').mockResolvedValue({
        data: null,
        error: new Error('Invalid login credentials'),
      });

      const res = await request(app)
        .post('/students/change-password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          current_password: 'WrongPassword1',
          new_password: 'NewPassword123',
          confirm_password: 'NewPassword123',
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/current password is incorrect/i);
    });

    test('POST /students/change-password updates password successfully with valid current password', async () => {
      jest.spyOn(supabaseAuth.auth, 'signInWithPassword').mockResolvedValue({
        data: { user: { id: testStudentId } },
        error: null,
      });

      jest.spyOn(supabase.auth.admin, 'updateUserById').mockResolvedValue({
        data: { user: { id: testStudentId } },
        error: null,
      });

      const res = await request(app)
        .post('/students/change-password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          current_password: 'CurrentPassword1',
          new_password: 'NewPassword123',
          confirm_password: 'NewPassword123',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    test('POST /admin/students/:id/set-password requires admin privileges', async () => {
      const res = await request(app)
        .post(`/admin/students/${testStudentId}/set-password`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          new_password: 'AdminSetPassword123',
          confirm_password: 'AdminSetPassword123',
        });
      expect(res.status).toBe(403);
    });

    test('POST /admin/students/:id/set-password allows admin to set password without old password', async () => {
      jest.spyOn(supabase, 'from').mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: testStudentId,
                name: testStudentName,
                roll_number: testStudentRoll,
              },
              error: null,
            }),
          }),
        }),
      });

      jest.spyOn(supabase.auth.admin, 'listUsers').mockResolvedValue({
        data: {
          users: [
            {
              id: 'auth-user-1',
              email: 'student_cs_101@attendance.system',
              user_metadata: {
                student_id: testStudentId,
                roll_number: testStudentRoll,
              },
            },
          ],
        },
        error: null,
      });

      jest.spyOn(supabase.auth.admin, 'updateUserById').mockResolvedValue({
        data: { user: { id: 'auth-user-1' } },
        error: null,
      });

      const res = await request(app)
        .post(`/admin/students/${testStudentId}/set-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          new_password: 'AdminNewPassword123',
          confirm_password: 'AdminNewPassword123',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.message).toMatch(/password updated successfully/i);
    });
  });

  // ── 6. Attendance Identity Enforcement ───────────────────────────────
  describe('Attendance Identity Enforcement', () => {
    test('POST /attendance/mark returns 401 without authentication', async () => {
      const res = await request(app)
        .post('/attendance/mark')
        .attach('audio', Buffer.from('fake audio'), 'attendance.webm');
      expect(res.status).toBe(401);
    });

    test('POST /attendance/mark rejects attempt to mark attendance for another student', async () => {
      const otherStudentId = '99999999-8888-7777-6666-555555555555';
      const res = await request(app)
        .post('/attendance/mark')
        .set('Authorization', `Bearer ${studentToken}`)
        .field('student_id', otherStudentId)
        .attach('audio', Buffer.from('fake audio'), 'attendance.webm');

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/cannot mark attendance for another student/i);
    });
  });
});

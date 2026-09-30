// Student Auth Helper
// Coordinates student records with Supabase Auth users, activation codes, and passwords.

const crypto = require('crypto');
const { supabase } = require('../supabaseClient');
const { getStudentAuthEmail } = require('./authUtils');

/**
 * Finds an auth user by email (case-insensitive).
 */
async function findAuthUserByEmail(email) {
  if (!email) return null;
  const target = email.toLowerCase().trim();
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error || !data?.users) return null;
  return data.users.find((u) => u.email && u.email.toLowerCase() === target) || null;
}

/**
 * Finds an auth user by student_id in metadata.
 */
async function findAuthUserByStudentId(studentId) {
  if (!studentId) return null;
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error || !data?.users) return null;
  return (
    data.users.find(
      (u) =>
        u.user_metadata?.student_id === studentId ||
        u.app_metadata?.student_id === studentId ||
        u.id === studentId
    ) || null
  );
}

/**
 * Ensures a Supabase Auth user exists for the given student record.
 * If not, creates one with a random initial password and is_activated = false.
 */
async function getOrCreateStudentAuthUser(student, initialPassword = null) {
  const email = getStudentAuthEmail(student.roll_number);

  // 1. Try finding by email
  let authUser = await findAuthUserByEmail(email);

  // 2. Try finding by student_id
  if (!authUser) {
    authUser = await findAuthUserByStudentId(student.id);
  }

  if (authUser) {
    // Ensure metadata contains student_id and roll_number
    if (
      !authUser.user_metadata?.student_id ||
      authUser.user_metadata.student_id !== student.id ||
      !authUser.user_metadata?.roll_number
    ) {
      await supabase.auth.admin.updateUserById(authUser.id, {
        user_metadata: {
          ...authUser.user_metadata,
          student_id: student.id,
          roll_number: student.roll_number,
          role: 'student',
        },
      });
    }
    // Sync auth_user_id to student table if column exists
    await syncStudentTableAuthState(student.id, { auth_user_id: authUser.id });
    return authUser;
  }

  // 3. Create new auth user
  const tempPassword =
    initialPassword ||
    `Init_${crypto.randomBytes(8).toString('hex')}A1!`;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      student_id: student.id,
      roll_number: student.roll_number,
      role: 'student',
      is_activated: false,
    },
    app_metadata: {
      role: 'student',
      student_id: student.id,
    },
  });

  if (error) {
    throw new Error(`Failed to create student auth user: ${error.message}`);
  }

  // Sync auth_user_id to student table if column exists
  await syncStudentTableAuthState(student.id, { auth_user_id: data.user.id });

  return data.user;
}

/**
 * Safely updates public.students table with auth linkage / activation fields.
 * Gracefully ignores errors if migration columns are not yet present in PostgreSQL cache.
 */
async function syncStudentTableAuthState(studentId, fields) {
  try {
    const { error } = await supabase.from('students').update(fields).eq('id', studentId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Safely records single-use activation code in student_activations table if it exists.
 */
async function recordActivationAudit(studentId, activationCodeHash, expiresAt, usedAt = null) {
  try {
    const { error } = await supabase.from('student_activations').insert({
      student_id: studentId,
      activation_code_hash: activationCodeHash,
      expires_at: expiresAt,
      used_at: usedAt,
    });
    return !error;
  } catch {
    return false;
  }
}

module.exports = {
  findAuthUserByEmail,
  findAuthUserByStudentId,
  getOrCreateStudentAuthUser,
  syncStudentTableAuthState,
  recordActivationAudit,
};

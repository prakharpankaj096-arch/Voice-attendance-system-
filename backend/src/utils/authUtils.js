// Authentication & Activation Utilities
// Provides secure activation token generation, hashing, password validation, and identifier mapping.

const crypto = require('crypto');

/**
 * Generates a cryptographically secure activation code.
 * Format: ACT-XXXXXX (8 uppercase alphanumeric characters, easy to read and enter)
 */
function generateActivationCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars (O, 0, 1, I)
  const bytes = crypto.randomBytes(6);
  let code = 'ACT-';
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/**
 * Hashes an activation code using SHA-256 with a system-level salt.
 * @param {string} code 
 * @returns {string} hex digest
 */
function hashActivationCode(code) {
  if (!code || typeof code !== 'string') return null;
  const normalized = code.trim().toUpperCase();
  return crypto.createHash('sha256').update(`act_salt_${normalized}`).digest('hex');
}

/**
 * Verifies an activation code against its stored hash in constant time.
 * @param {string} inputCode 
 * @param {string} storedHash 
 * @returns {boolean}
 */
function verifyActivationCode(inputCode, storedHash) {
  if (!inputCode || !storedHash) return false;
  const inputHash = hashActivationCode(inputCode);
  if (!inputHash || inputHash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(storedHash));
}

/**
 * Validates password strength according to project requirements:
 * - At least 6 characters
 * - Contains at least one letter and at least one number
 * @param {string} password 
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required and must be a string' };
  }
  if (password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters long' };
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one letter and one number' };
  }
  return { valid: true };
}

/**
 * Maps a student's roll number to their internal Supabase Auth email.
 * @param {string} rollNumber 
 * @returns {string}
 */
function getStudentAuthEmail(rollNumber) {
  const sanitized = String(rollNumber).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return `student_${sanitized}@attendance.system`;
}

/**
 * Maps an admin identifier to an internal Supabase Auth email.
 * @param {string} adminId 
 * @returns {string}
 */
function getAdminAuthEmail(adminId) {
  const trimmed = String(adminId).trim().toLowerCase();
  if (trimmed.includes('@')) {
    return trimmed;
  }
  const sanitized = trimmed.replace(/[^a-z0-9_-]/g, '_');
  return `admin_${sanitized}@attendance.system`;
}

module.exports = {
  generateActivationCode,
  hashActivationCode,
  verifyActivationCode,
  validatePasswordStrength,
  getStudentAuthEmail,
  getAdminAuthEmail,
};

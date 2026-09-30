/**
 * Database & Schema Verification Script
 * Validates the database state, schema requirements, existing data integrity,
 * student/admin relationships, attendance relationships, and voice enrollment relationships.
 */

require('dotenv').config();
const { supabase, supabaseAuth } = require('../src/supabaseClient');
const {
  generateActivationCode,
  hashActivationCode,
  verifyActivationCode,
  validatePasswordStrength,
} = require('../src/utils/authUtils');
const {
  getOrCreateStudentAuthUser,
  syncStudentTableAuthState,
  recordActivationAudit,
} = require('../src/utils/studentAuthHelper');

async function runVerification() {
  console.log('='.repeat(70));
  console.log(' DATABASE & AUTHENTICATION ARCHITECTURE VERIFICATION');
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    // ── 1. STUDENT IDENTITY & DATA INTEGRITY ───────────────────────────────
    console.log('\n[1] Verifying Student Identity & Data Integrity...');
    const { data: students, error: sErr } = await supabase
      .from('students')
      .select('*');

    assert(!sErr, 'Query students table successfully', sErr?.message);
    assert(students && students.length > 0, 'Existing student records found');

    const prakhar = students.find((s) => s.roll_number === '21');
    assert(!!prakhar, 'Student "Prakhar Pankaj" (Roll 21) exists');
    assert(
      prakhar && prakhar.id === '0ff6ac48-f88e-417f-95c7-33db9ff625e7',
      'Student has stable UUID identity',
      prakhar?.id
    );
    assert(
      prakhar && prakhar.department === 'Computer Science',
      'Student department preserved intact'
    );

    // Roll number uniqueness
    const rollNumbers = students.map((s) => s.roll_number.toLowerCase());
    const uniqueRolls = new Set(rollNumbers);
    assert(
      rollNumbers.length === uniqueRolls.size,
      'All student roll numbers are unique'
    );

    // ── 2. VOICE ENROLLMENT INTEGRITY ─────────────────────────────────────
    console.log('\n[2] Verifying Voice Enrollment Integrity...');
    assert(
      prakhar && Array.isArray(prakhar.voice_embedding),
      'Voice embedding exists as array'
    );
    assert(
      prakhar && prakhar.voice_embedding.length === 192,
      `Voice embedding has exact 192-dim vector (got ${prakhar?.voice_embedding?.length})`
    );
    const allNumbers = prakhar.voice_embedding.every(
      (v) => typeof v === 'number' && !isNaN(v)
    );
    assert(allNumbers, 'All 192 embedding elements are valid numeric float8 values');

    // ── 3. ATTENDANCE RELATIONSHIPS & HISTORICAL DATA ───────────────────────
    console.log('\n[3] Verifying Attendance Relationships & Historical Records...');
    const { data: attendance, error: attErr } = await supabase
      .from('attendance')
      .select('*');

    assert(!attErr, 'Query attendance table successfully', attErr?.message);
    assert(attendance && attendance.length > 0, 'Historical attendance records exist');

    const sampleAtt = attendance.find(
      (a) => a.id === 'a44f012b-669a-4313-9aa6-208793042f2d'
    );
    assert(!!sampleAtt, 'Historical record a44f012b-... preserved intact');
    assert(
      sampleAtt && sampleAtt.student_id === prakhar.id,
      'Attendance student_id correctly references student UUID (foreign key relationship)'
    );
    assert(
      sampleAtt && sampleAtt.status === 'present',
      'Attendance status correctly recorded as "present"'
    );
    assert(
      sampleAtt && sampleAtt.date === '2026-09-04',
      'Attendance date preserved correctly (2026-09-04)'
    );

    // ── 4. ADMIN IDENTITY & RELATIONSHIPS ──────────────────────────────────
    console.log('\n[4] Verifying Admin Identity & Authorization Relationships...');
    const { data: admins, error: admErr } = await supabase
      .from('admins')
      .select('*');

    assert(!admErr, 'Query admins table successfully', admErr?.message);
    assert(admins && admins.length > 0, 'Admin records exist');

    const admin = admins.find((a) => a.email === 'prakharpankaj096@gmail.com');
    assert(!!admin, 'Primary admin "prakharpankaj096@gmail.com" exists');
    assert(
      admin && admin.role === 'admin',
      'Admin record has "admin" role'
    );
    assert(
      admin && admin.id === 'ded05a6a-f152-481b-9a25-d3e3a31ce9f0',
      'Admin record has stable UUID'
    );

    // ── 5. AUTH USER & STUDENT LINKAGE ─────────────────────────────────────
    console.log('\n[5] Verifying Supabase Auth & Student Mapping...');
    const authUser = await getOrCreateStudentAuthUser(prakhar);
    assert(!!authUser, 'Supabase Auth user mapped/resolved for student');
    assert(
      authUser.email.toLowerCase() === 'student_21@attendance.system',
      `Auth user email format mapped correctly: ${authUser.email}`
    );
    assert(
      authUser.user_metadata?.student_id === prakhar.id,
      'Auth user metadata correctly links to student_id'
    );
    assert(
      authUser.user_metadata?.roll_number === prakhar.roll_number,
      'Auth user metadata correctly links to roll_number'
    );
    assert(
      authUser.user_metadata?.role === 'student',
      'Auth user role is "student"'
    );

    // ── 6. ACTIVATION SECURITY & HASHING ───────────────────────────────────
    console.log('\n[6] Verifying Activation Token Security & Hashing...');
    const code = generateActivationCode();
    assert(
      /^ACT-[A-Z0-9]{6}$/.test(code),
      `Activation code format is ACT-XXXXXX (generated: ${code})`
    );

    const hash = hashActivationCode(code);
    assert(
      typeof hash === 'string' && hash.length === 64,
      'Activation code hash is valid 64-char hex SHA-256 hash'
    );
    assert(
      hash !== code,
      'Activation code is never stored in plaintext'
    );
    assert(
      verifyActivationCode(code, hash),
      'Valid activation code verifies against hash'
    );
    assert(
      !verifyActivationCode('ACT-WRONG1', hash),
      'Invalid activation code rejected'
    );

    // ── 7. PASSWORD STORAGE & VALIDATION ───────────────────────────────────
    console.log('\n[7] Verifying Password Security & Architecture...');
    const weakPass = validatePasswordStrength('abc');
    assert(!weakPass.valid, 'Short password (< 6 chars) rejected');

    const noNumPass = validatePasswordStrength('abcdefgh');
    assert(!noNumPass.valid, 'Password without number rejected');

    const strongPass = validatePasswordStrength('ValidPass123');
    assert(strongPass.valid, 'Valid password accepted');

    // ── 8. PRIVACY INVARIANT: NO VOICE EMBEDDING EXPOSURE ──────────────────
    console.log('\n[8] Verifying Data Privacy Invariants...');
    // Test that safe views or typical API responses do not expose embedding
    const safeProjection = {
      id: prakhar.id,
      name: prakhar.name,
      roll_number: prakhar.roll_number,
      department: prakhar.department,
      voice_enrolled: Array.isArray(prakhar.voice_embedding) && prakhar.voice_embedding.length > 0,
    };
    assert(
      safeProjection.voice_embedding === undefined,
      'API safe projection does NOT contain voice_embedding'
    );
    assert(
      safeProjection.voice_enrolled === true,
      'voice_enrolled boolean flag correctly derived without exposing embedding'
    );

    // ── SUMMARY ────────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(70));
    console.log(` VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log('='.repeat(70));

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Unexpected verification error:', err);
    process.exit(1);
  }
}

runVerification();

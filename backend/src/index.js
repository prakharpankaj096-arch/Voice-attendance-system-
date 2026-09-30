// Voice Attendance System — Node.js Backend
// Entry point: Express server with auth, health, stats, and admin routes.

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { supabase, supabaseAuth } = require('./supabaseClient');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const { detectIntent, generateResponse } = require('./assistant');
const {
  generateActivationCode,
  hashActivationCode,
  verifyActivationCode,
  validatePasswordStrength,
  getStudentAuthEmail,
  getAdminAuthEmail,
} = require('./utils/authUtils');
const {
  findAuthUserByEmail,
  findAuthUserByStudentId,
  getOrCreateStudentAuthUser,
  syncStudentTableAuthState,
  recordActivationAudit,
} = require('./utils/studentAuthHelper');

const app = express();
const PORT = process.env.PORT || 5000;

// Configure multer for in-memory audio uploads (max 25MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Middleware
app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES — no authentication required
// ═══════════════════════════════════════════════════════════════════════

// ── Health check (basic) ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'voice-attendance-backend' });
});

// ── Health check (database) ─────────────────────────────────────────
app.get('/health/db', async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Connected to Supabase but query failed',
        detail: error.message,
      });
    }

    res.json({
      status: 'ok',
      message: 'Supabase connection successful',
      students_count: count,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Could not reach Supabase',
      detail: err.message,
    });
  }
});

// ── Health check (voice microservice) ───────────────────────────────
const VOICE_SERVICE_URL = process.env.VOICE_SERVICE_URL || 'http://localhost:8000';

app.get('/health/voice-service', async (req, res) => {
  try {
    const response = await fetch(`${VOICE_SERVICE_URL}/health`);
    const data = await response.json();
    res.json({ status: 'ok', voice_service: data });
  } catch (err) {
    res.status(502).json({
      status: 'error',
      message: 'Could not reach voice-service',
      detail: err.message,
    });
  }
});

// ── Dashboard stats ─────────────────────────────────────────────────
app.get('/stats', async (req, res) => {
  try {
    const { count: totalStudents, error: studentsErr } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true });

    if (studentsErr) throw studentsErr;

    const today = new Date().toISOString().slice(0, 10);

    const { count: presentToday, error: presentErr } = await supabase
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .eq('date', today)
      .eq('status', 'present');

    if (presentErr) throw presentErr;

    const total = totalStudents || 0;
    const present = presentToday || 0;
    const absent = Math.max(0, total - present);
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;

    res.json({
      total_students: total,
      present_today: present,
      absent_today: absent,
      attendance_rate: rate,
    });
  } catch (err) {
    console.error('Stats query error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch stats',
      detail: err.message,
    });
  }
});

// ── GET /students/me ────────────────────────────────────────────────
// Returns the student record linked to the currently authenticated user.
// Resolution strategies (same as authorizeStudentAccess):
//   1. user_metadata.student_id or app_metadata.student_id
//   2. students.id matches the auth user's id
//   3. students.email matches the auth user's email
//   4. students.user_id or students.auth_user_id matches the auth user's id
// Returns 404 if no linked student is found — the user must complete enrollment.
app.get('/students/me', requireAuth, async (req, res) => {
  try {
    // Try metadata-based resolution first
    const metaStudentId =
      req.user.user_metadata?.student_id ||
      req.user.app_metadata?.student_id ||
      req.user.student_id;

    if (metaStudentId) {
      const { data: student } = await supabase
        .from('students')
        .select('id, name, roll_number, department')
        .eq('id', metaStudentId)
        .maybeSingle();

      if (student) {
        return res.json({ status: 'ok', student });
      }
    }

    // Try matching by auth user id directly (if students.id === auth user id)
    const { data: byId } = await supabase
      .from('students')
      .select('id, name, roll_number, department')
      .eq('id', req.user.id)
      .maybeSingle();

    if (byId) {
      return res.json({ status: 'ok', student: byId });
    }

    // Try matching by email if available
    if (req.user.email) {
      const { data: byEmail } = await supabase
        .from('students')
        .select('id, name, roll_number, department')
        .eq('email', req.user.email.toLowerCase())
        .maybeSingle();

      if (byEmail) {
        return res.json({ status: 'ok', student: byEmail });
      }
    }

    // Try matching by roll_number from token / metadata
    const roll = req.user.roll_number || req.user.user_metadata?.roll_number;
    if (roll) {
      const { data: byRoll } = await supabase
        .from('students')
        .select('id, name, roll_number, department')
        .ilike('roll_number', String(roll).trim())
        .maybeSingle();

      if (byRoll) {
        return res.json({ status: 'ok', student: byRoll });
      }
    }

    // No linked student found
    return res.status(404).json({
      status: 'error',
      message: 'No student record linked to your account. Please complete voice enrollment first.',
    });
  } catch (err) {
    console.error('Students/me error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to resolve student profile.',
    });
  }
});

// ── Student search ──────────────────────────────────────────────
// Searches students by name or roll number (case-insensitive partial match).
// Requires authentication.
// Returns at most 50 students with attendance percentage: floor(present_count / total_count * 100).
// Never returns voice_embedding.
app.get('/students/search', requireAuth, async (req, res) => {
  const rawQ = req.query.q;

  if (rawQ === undefined || rawQ === null || typeof rawQ !== 'string' || rawQ.trim() === '') {
    return res.status(400).json({
      status: 'error',
      message: 'Search query is required and must not be empty.',
    });
  }

  const q = rawQ.trim();
  if (q.length > 100) {
    return res.status(400).json({
      status: 'error',
      message: 'Search query must be between 1 and 100 characters.',
    });
  }

  try {
    // Search student name OR roll number (case-insensitive, max 50)
    // Explicitly select only non-sensitive columns (never voice_embedding)
    const { data: students, error: studentsErr } = await supabase
      .from('students')
      .select('id, name, roll_number, department')
      .or(`name.ilike.%${q}%,roll_number.ilike.%${q}%`)
      .order('name', { ascending: true })
      .limit(50);

    if (studentsErr) throw studentsErr;

    if (!students || students.length === 0) {
      return res.json([]);
    }

    // Fetch attendance records for matched students
    const studentIds = students.map((s) => s.id);
    const { data: attendanceRecords, error: attErr } = await supabase
      .from('attendance')
      .select('student_id, status')
      .in('student_id', studentIds);

    if (attErr) throw attErr;

    // Count present and total attendance records per student
    const attendanceStats = {};
    (attendanceRecords || []).forEach((record) => {
      if (!attendanceStats[record.student_id]) {
        attendanceStats[record.student_id] = { total: 0, present: 0 };
      }
      attendanceStats[record.student_id].total += 1;
      if (record.status === 'present') {
        attendanceStats[record.student_id].present += 1;
      }
    });

    const results = students.map((student) => {
      const stats = attendanceStats[student.id] || { total: 0, present: 0 };
      const percentage =
        stats.total > 0
          ? Math.floor((stats.present / stats.total) * 100)
          : 0;

      return {
        id: student.id,
        name: student.name,
        roll_number: student.roll_number,
        department: student.department || null,
        attendance_percentage: percentage,
      };
    });

    return res.json(results);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Search failed. Please try again.',
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// VOICE & ATTENDANCE ROUTES
// ═══════════════════════════════════════════════════════════════════════

// ── POST /students/enroll ───────────────────────────────────────────
// Enrolls a student's voiceprint: receives 5 audio files.
// Enrollment happens ONLY ONCE during account setup unless reset by admin.
// Security: Session identity is strictly enforced; client cannot choose arbitrary student_id.
app.post('/students/enroll', requireAuth, upload.array('audio_files', 5), async (req, res) => {
  const user = req.user;
  let targetStudent = null;

  try {
    if (user.role === 'admin') {
      // Admin can enroll on behalf of a student if student_id or roll_number is provided
      const studentIdParam = req.body?.student_id;
      const rollParam = req.body?.roll_number;

      if (studentIdParam) {
        const { data } = await supabase.from('students').select('*').eq('id', studentIdParam).maybeSingle();
        targetStudent = data;
      } else if (rollParam) {
        const { data } = await supabase.from('students').select('*').ilike('roll_number', String(rollParam).trim()).maybeSingle();
        targetStudent = data;
      }
    } else {
      // Authenticated Student: Identity MUST be determined strictly from the authenticated session
      // Reject any attempt by client to specify another student's identity
      const bodyStudentId = req.body?.student_id;
      const bodyRoll = req.body?.roll_number;

      if (bodyStudentId && user.student_id && String(bodyStudentId).trim() !== String(user.student_id).trim()) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to enroll voice for another student.',
        });
      }

      if (bodyRoll && user.roll_number && String(bodyRoll).trim().toLowerCase() !== String(user.roll_number).trim().toLowerCase()) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to enroll voice for another student.',
        });
      }

      // Resolve target student from authenticated session
      if (user.student_id) {
        const { data } = await supabase.from('students').select('*').eq('id', user.student_id).maybeSingle();
        targetStudent = data;
      }
      if (!targetStudent && user.roll_number) {
        const { data } = await supabase.from('students').select('*').ilike('roll_number', String(user.roll_number).trim()).maybeSingle();
        targetStudent = data;
      }
      if (!targetStudent && user.id) {
        const { data } = await supabase.from('students').select('*').eq('id', user.id).maybeSingle();
        targetStudent = data;
      }
    }

    if (!targetStudent) {
      return res.status(404).json({
        status: 'error',
        message: 'Student account not found. Please complete first-time account setup.',
      });
    }

    // Enforce one-time voice enrollment: if already enrolled, reject with 409
    const hasVoice =
      targetStudent.voice_embedding !== null &&
      targetStudent.voice_embedding !== undefined &&
      (!Array.isArray(targetStudent.voice_embedding) || targetStudent.voice_embedding.length > 0);

    if (hasVoice) {
      return res.status(409).json({
        status: 'error',
        already_enrolled: true,
        message:
          'Voice profile is already enrolled for this student. Only an administrator can reset your voice profile.',
      });
    }

    // Audio file count validation
    if (!req.files || req.files.length < 5) {
      return res.status(400).json({
        status: 'error',
        message: `Expected 5 audio files for enrollment, received ${req.files ? req.files.length : 0}`,
      });
    }

    // Build FormData to forward audio to voice-service /enroll
    // Microservice runs in-memory without permanent audio storage
    const formData = new FormData();
    formData.append('student_id', targetStudent.roll_number || targetStudent.id);

    for (const file of req.files) {
      const blob = new Blob([file.buffer], { type: file.mimetype || 'audio/webm' });
      formData.append('files', blob, file.originalname || 'sample.webm');
    }

    const voiceRes = await fetch(`${VOICE_SERVICE_URL}/enroll`, {
      method: 'POST',
      body: formData,
    });

    if (!voiceRes.ok) {
      const errData = await voiceRes.json().catch(() => ({}));
      throw new Error(errData.detail || `Voice service error: ${voiceRes.statusText}`);
    }

    const voiceData = await voiceRes.json();

    // Save voice embedding to student record in Supabase
    const { data: updated, error: updateErr } = await supabase
      .from('students')
      .update({ voice_embedding: voiceData.embedding })
      .eq('id', targetStudent.id)
      .select('id, name, roll_number, department, created_at')
      .single();

    if (updateErr) throw updateErr;

    // Update Supabase Auth user metadata if exists
    try {
      const authUser = await findAuthUserByStudentId(targetStudent.id);
      if (authUser) {
        await supabase.auth.admin.updateUserById(authUser.id, {
          user_metadata: {
            ...authUser.user_metadata,
            voice_enrolled: true,
          },
        });
      }
    } catch (_) {}

    // Never return voice_embedding to client
    res.json({
      status: 'ok',
      message: 'Student enrolled and voiceprint saved successfully',
      student: {
        id: updated.id,
        name: updated.name,
        roll_number: updated.roll_number,
        department: updated.department,
        voice_enrolled: true,
        created_at: updated.created_at,
      },
      embedding_dim: voiceData.dimension,
      avg_internal_similarity: voiceData.avg_internal_similarity,
      quality_reports: voiceData.quality_reports,
    });
  } catch (err) {
    console.error('Enrollment error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to enroll student voice',
      detail: err.message,
    });
  }
});

// ── POST /attendance/mark ───────────────────────────────────────────
// Marks attendance using voice biometric verification.
// Requires authenticated session. student_id is strictly resolved from the session.
// Client cannot submit another student_id.
// Performs 1:1 voice verification against the authenticated student's enrolled voice.
app.post('/attendance/mark', requireAuth, upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      status: 'error',
      message: 'Audio file is required to mark attendance',
    });
  }

  // 1. Resolve student_id strictly from the authenticated session
  const studentId = req.user.student_id || req.user.id;

  // 2. Reject unauthorized student_id overrides
  const clientProvidedId = req.body?.student_id || req.query?.student_id;
  if (clientProvidedId && clientProvidedId !== studentId && req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Forbidden: You cannot mark attendance for another student.',
    });
  }

  try {
    // 3. Fetch ONLY the authenticated student's record with voice embedding
    const { data: student, error: fetchErr } = await supabase
      .from('students')
      .select('id, name, roll_number, voice_embedding')
      .eq('id', studentId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student record not found. Please complete enrollment first.',
      });
    }

    if (
      !student.voice_embedding ||
      (Array.isArray(student.voice_embedding) && student.voice_embedding.length === 0)
    ) {
      return res.status(400).json({
        status: 'error',
        message: 'Your voice profile is not enrolled. Please complete voice enrollment first.',
      });
    }

    // 4. Prepare candidate array containing ONLY this authenticated student (1:1 verification)
    const candidates = [
      {
        id: student.id,
        name: student.name,
        roll_number: student.roll_number,
        voice_embedding: student.voice_embedding,
      },
    ];

    // 5. Send to voice-service /verify
    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' });
    formData.append('audio', blob, req.file.originalname || 'verify.webm');
    formData.append('candidates', JSON.stringify(candidates));

    const verifyRes = await fetch(`${VOICE_SERVICE_URL}/verify`, {
      method: 'POST',
      body: formData,
    });

    if (!verifyRes.ok) {
      const errData = await verifyRes.json().catch(() => ({}));
      throw new Error(errData.detail || `Voice service verification failed: ${verifyRes.statusText}`);
    }

    const verifyData = await verifyRes.json();
    const { transcription, best_match, score, quality } = verifyData;
    const intentInfo = detectIntent(transcription);
    const MATCH_THRESHOLD = 0.75;

    // 6. Verification decision
    if (best_match && score >= MATCH_THRESHOLD && best_match.id === student.id) {
      const today = new Date().toISOString().slice(0, 10);

      // Check if already marked present today
      const { data: existingAttendance } = await supabase
        .from('attendance')
        .select('id, time')
        .eq('student_id', student.id)
        .eq('date', today)
        .eq('status', 'present')
        .maybeSingle();

      if (existingAttendance) {
        return res.json({
          status: 'ok',
          matched: true,
          already_marked: true,
          student: best_match,
          score,
          transcription,
          detected_intent: intentInfo.intent,
          quality,
          message: generateResponse('mark_attendance', {
            matched: true,
            already_marked: true,
            student: best_match,
            score,
          }),
        });
      }

      // Mark attendance
      const { data: record, error: markErr } = await supabase
        .from('attendance')
        .insert({
          student_id: student.id,
          date: today,
          time: new Date().toISOString(),
          status: 'present',
          verification_score: score,
        })
        .select()
        .single();

      if (markErr) throw markErr;

      return res.json({
        status: 'ok',
        matched: true,
        already_marked: false,
        student: best_match,
        score,
        transcription,
        detected_intent: intentInfo.intent,
        quality,
        attendance_record: record,
        message: generateResponse('mark_attendance', {
          matched: true,
          already_marked: false,
          student: best_match,
          score,
        }),
      });
    } else {
      // Rejection
      return res.json({
        status: 'ok',
        matched: false,
        student: best_match || null,
        score: score || 0,
        transcription,
        detected_intent: intentInfo.intent,
        quality,
        message: generateResponse('mark_attendance', {
          matched: false,
          student: best_match || null,
          score: score || 0,
        }),
      });
    }
  } catch (err) {
    console.error('Mark attendance error:', err);
    res.status(500).json({
      status: 'error',
      message: err.message || 'Attendance verification failed',
    });
  }
});

// ── Helper: Authorize student data access ───────────────────────────
// Admin users may access any student record.
// Student users may only access their own linked student record.
async function authorizeStudentAccess(req, studentId) {
  // 1. Verify student exists in database (do not expose voice_embedding)
  const { data: student, error: studentErr } = await supabase
    .from('students')
    .select('id, name, roll_number, department')
    .eq('id', studentId)
    .maybeSingle();

  if (studentErr) {
    return { status: 500, message: 'Database query failed. Please try again.' };
  }

  if (!student) {
    return { status: 404, message: 'Student not found' };
  }

  // 2. Check if the authenticated user is an admin
  let isAdmin =
    req.user.role === 'admin' ||
    req.user.app_metadata?.role === 'admin' ||
    req.user.user_metadata?.role === 'admin';

  if (!isAdmin && req.user.id) {
    try {
      const { data: adminRow } = await supabase
        .from('admins')
        .select('id, role')
        .eq('id', req.user.id)
        .maybeSingle();

      if (adminRow) {
        isAdmin = true;
      }
    } catch (_) {
      // Ignore query error and fall back to ownership check
    }
  }

  // 3. If not admin, check student ownership
  const isOwner =
    req.user.id === student.id ||
    req.user.student_id === student.id ||
    req.user.user_metadata?.student_id === student.id ||
    req.user.app_metadata?.student_id === student.id ||
    (req.user.roll_number && student.roll_number && req.user.roll_number.toLowerCase() === student.roll_number.toLowerCase()) ||
    (student.auth_user_id && student.auth_user_id === req.user.id) ||
    (student.user_id && student.user_id === req.user.id) ||
    (student.email && req.user.email && student.email.toLowerCase() === req.user.email.toLowerCase());

  if (!isAdmin && !isOwner) {
    return { status: 403, message: 'Forbidden: You can only access your own student record.' };
  }

  return { student, isAdmin, isOwner };
}

// ── GET /attendance/:student_id/percentage ─────────────────────────
// Returns student attendance percentage, present count, and total count.
// Formula: total_count === 0 ? 0 : floor((present_count / total_count) * 100)
// Requires valid JWT and student ownership or admin privileges.
app.get('/attendance/:student_id/percentage', requireAuth, async (req, res) => {
  const studentId = req.params.student_id || req.params.studentId;

  try {
    const authResult = await authorizeStudentAccess(req, studentId);
    if (authResult.status) {
      return res.status(authResult.status).json({
        status: 'error',
        message: authResult.message,
      });
    }

    const { data: records, error: recordsErr } = await supabase
      .from('attendance')
      .select('status')
      .eq('student_id', studentId);

    if (recordsErr) {
      console.error('Attendance percentage error:', recordsErr);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to fetch attendance records',
      });
    }

    const total_count = records ? records.length : 0;
    const present_count = records
      ? records.filter((r) => r.status === 'present').length
      : 0;

    const percentage =
      total_count === 0
        ? 0
        : Math.floor((present_count / total_count) * 100);

    res.json({
      student_id: studentId,
      percentage,
      present_count,
      total_count,
    });
  } catch (err) {
    console.error('Percentage calculation error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to calculate attendance percentage',
      detail: err.message,
    });
  }
});

// ── GET /attendance/:student_id ───────────────────────────────────
// Returns a student's attendance records, sorted newest date first.
// Requires valid JWT and student ownership or admin privileges.
// Returns an empty array if no records exist.
// Never exposes voice_embedding.
app.get('/attendance/:student_id', requireAuth, async (req, res) => {
  const studentId = req.params.student_id || req.params.studentId;

  try {
    const authResult = await authorizeStudentAccess(req, studentId);
    if (authResult.status) {
      return res.status(authResult.status).json({
        status: 'error',
        message: authResult.message,
      });
    }

    const { data: records, error: recordsErr } = await supabase
      .from('attendance')
      .select('id, date, time, status, verification_score')
      .eq('student_id', studentId)
      .order('date', { ascending: false })
      .order('time', { ascending: false });

    if (recordsErr) {
      console.error('Attendance history query error:', recordsErr);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to fetch attendance history',
      });
    }

    res.json(records || []);
  } catch (err) {
    console.error('Attendance history error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch attendance history',
      detail: err.message,
    });
  }
});

// ── POST /assistant/query ──────────────────────────────────────────
// Conversational query endpoint (speech-to-text or typed).
// Routes by intent and returns templated voice/text response.
app.post('/assistant/query', async (req, res) => {
  const { text, student_id } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ status: 'error', message: 'Query text is required' });
  }

  const { intent, extracted } = detectIntent(text);

  if (intent === 'search_student') {
    const q = (extracted || text).trim();
    const { data: students } = await supabase
      .from('students')
      .select('id, name, roll_number, department')
      .or(`name.ilike.%${q}%,roll_number.ilike.%${q}%`)
      .order('name')
      .limit(5);

    let results = [];
    if (students && students.length > 0) {
      const { data: allDates } = await supabase
        .from('attendance')
        .select('date')
        .eq('status', 'present');
      const totalDays = new Set((allDates || []).map((r) => r.date)).size;

      for (const s of students) {
        const { count } = await supabase
          .from('attendance')
          .select('*', { count: 'exact', head: true })
          .eq('student_id', s.id)
          .eq('status', 'present');
        const present = count || 0;
        const percentage = totalDays > 0 ? Math.round((present / totalDays) * 100) : 0;
        results.push({ ...s, attendance_percentage: percentage, classes_present: present, total_classes: totalDays });
      }
    }

    const message = generateResponse('search_student', { results });
    return res.json({ status: 'ok', intent, message, results });
  }

  if (intent === 'check_attendance') {
    let targetStudent = null;
    if (student_id) {
      const { data: s } = await supabase
        .from('students')
        .select('id, name, roll_number')
        .eq('id', student_id)
        .maybeSingle();
      targetStudent = s;
    } else if (extracted) {
      const { data: s } = await supabase
        .from('students')
        .select('id, name, roll_number')
        .or(`name.ilike.%${extracted}%,roll_number.ilike.%${extracted}%`)
        .maybeSingle();
      targetStudent = s;
    }

    if (targetStudent) {
      const { count } = await supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', targetStudent.id)
        .eq('status', 'present');
      const { data: allDates } = await supabase
        .from('attendance')
        .select('date')
        .eq('status', 'present');
      const totalDays = new Set((allDates || []).map((r) => r.date)).size;
      const present = count || 0;
      const percentage = totalDays > 0 ? Math.round((present / totalDays) * 100) : 0;

      const message = generateResponse('check_attendance', {
        student: targetStudent,
        percentage,
        classes_present: present,
        total_classes: totalDays,
      });
      return res.json({ status: 'ok', intent, message, student: targetStudent, percentage });
    }

    return res.json({
      status: 'ok',
      intent,
      message: 'Please mention your name or roll number to check your attendance percentage.',
    });
  }

  const message = generateResponse(intent);
  return res.json({ status: 'ok', intent, message });
});

// ═══════════════════════════════════════════════════════════════════════
// AUTH ROUTES — signup, login, current user
// ═══════════════════════════════════════════════════════════════════════

// ── POST /auth/signup ───────────────────────────────────────────────
// Creates a new Supabase Auth user with email + password.
app.post('/auth/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: 'error',
      message: 'Email and password are required',
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      status: 'error',
      message: 'Password must be at least 6 characters',
    });
  }

  try {
    const { data, error } = await supabaseAuth.auth.signUp({
      email,
      password,
    });

    if (error) {
      return res.status(400).json({
        status: 'error',
        message: error.message,
      });
    }

    res.json({
      status: 'ok',
      message: 'Account created successfully',
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      // Note: Supabase may require email confirmation depending on settings.
      // If email confirmation is disabled, data.session will contain the token.
      session: data.session ? {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      } : null,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Signup failed',
      detail: err.message,
    });
  }
});

// ── POST /auth/login ────────────────────────────────────────────────
// Supports:
// 1. Student Login (roll_number + password)
// 2. Admin Login (admin_id + password)
// 3. Email Login (legacy/backward compatibility)
app.post('/auth/login', async (req, res) => {
  const { roll_number, admin_id, email, password, role } = req.body;

  if (!password) {
    return res.status(400).json({
      status: 'error',
      message: 'Password is required',
    });
  }

  // 1. STUDENT LOGIN
  if (roll_number || role === 'student') {
    if (!roll_number) {
      return res.status(400).json({
        status: 'error',
        message: 'Roll number is required',
      });
    }

    try {
      const trimmedRoll = String(roll_number).trim();
      const { data: student, error: studentErr } = await supabase
        .from('students')
        .select('id, name, roll_number, department, voice_embedding')
        .ilike('roll_number', trimmedRoll)
        .maybeSingle();

      if (studentErr) throw studentErr;

      if (!student) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid roll number or password',
        });
      }

      // Resolve student's auth user
      const authUser = await getOrCreateStudentAuthUser(student);

      // Check if student has activated their account
      if (authUser.user_metadata?.is_activated === false) {
        return res.status(403).json({
          status: 'error',
          code: 'ACCOUNT_NOT_ACTIVATED',
          message:
            'Account is not activated. Please complete first-time activation using your activation code.',
        });
      }

      // Authenticate with Supabase Auth
      const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
        email: authUser.email,
        password,
      });

      if (authError) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid roll number or password',
        });
      }

      const hasVoice =
        student.voice_embedding !== null &&
        (!Array.isArray(student.voice_embedding) || student.voice_embedding.length > 0);

      return res.json({
        status: 'ok',
        user: {
          id: student.id,
          student_id: student.id,
          name: student.name,
          roll_number: student.roll_number,
          department: student.department,
          role: 'student',
          is_admin: false,
          voice_enrolled: hasVoice,
        },
        session: {
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
        },
      });
    } catch (err) {
      console.error('Student login error:', err);
      return res.status(500).json({
        status: 'error',
        message: 'Login failed. Please try again.',
      });
    }
  }

  // 2. ADMIN LOGIN
  if (admin_id || role === 'admin') {
    if (!admin_id) {
      return res.status(400).json({
        status: 'error',
        message: 'Admin ID is required',
      });
    }

    try {
      const trimmedAdminId = String(admin_id).trim();
      let adminEmail = null;

      if (trimmedAdminId.includes('@')) {
        adminEmail = trimmedAdminId.toLowerCase();
      } else {
        // Resolve admin from admins table
        const { data: admins } = await supabase.from('admins').select('id, email, role');
        if (admins && admins.length > 0) {
          const matched = admins.find(
            (a) =>
              a.email.toLowerCase().startsWith(trimmedAdminId.toLowerCase() + '@') ||
              a.id === trimmedAdminId
          );
          adminEmail = matched ? matched.email : admins[0].email;
        } else {
          adminEmail = getAdminAuthEmail(trimmedAdminId);
        }
      }

      const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
        email: adminEmail,
        password,
      });

      if (authError) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid Admin ID or password',
        });
      }

      // Verify admin role in admins table
      const { data: adminRow } = await supabase
        .from('admins')
        .select('id, role')
        .or(`id.eq.${authData.user.id},email.eq.${authData.user.email}`)
        .maybeSingle();

      if (!adminRow && authData.user.user_metadata?.role !== 'admin') {
        return res.status(403).json({
          status: 'error',
          message: "You don't have admin privileges",
        });
      }

      return res.json({
        status: 'ok',
        user: {
          id: authData.user.id,
          email: authData.user.email,
          admin_id: trimmedAdminId,
          role: 'admin',
          is_admin: true,
        },
        session: {
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
        },
      });
    } catch (err) {
      console.error('Admin login error:', err);
      return res.status(500).json({
        status: 'error',
        message: 'Login failed. Please try again.',
      });
    }
  }

  // 3. FALLBACK / EMAIL LOGIN (backward compatibility)
  if (email) {
    try {
      const { data, error } = await supabaseAuth.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        return res.status(401).json({
          status: 'error',
          message: error.message,
        });
      }

      const { data: adminRow } = await supabase
        .from('admins')
        .select('role')
        .or(`id.eq.${data.user.id},email.eq.${data.user.email}`)
        .maybeSingle();

      return res.json({
        status: 'ok',
        user: {
          id: data.user.id,
          email: data.user.email,
          is_admin: !!adminRow,
          role: adminRow?.role || 'student',
          student_id: data.user.user_metadata?.student_id || null,
          roll_number: data.user.user_metadata?.roll_number || null,
        },
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        },
      });
    } catch (err) {
      return res.status(500).json({
        status: 'error',
        message: 'Login failed',
        detail: err.message,
      });
    }
  }

  return res.status(400).json({
    status: 'error',
    message: 'Roll number, Admin ID, or email is required to log in',
  });
});

// ── POST /auth/activate/verify ───────────────────────────────────────
// Verifies roll number and one-time activation code before password creation.
app.post('/auth/activate/verify', async (req, res) => {
  const { roll_number, activation_code } = req.body;

  if (!roll_number || !activation_code) {
    return res.status(400).json({
      status: 'error',
      message: 'Roll number and activation code are required.',
    });
  }

  try {
    const trimmedRoll = String(roll_number).trim();
    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('id, name, roll_number, department, voice_embedding')
      .ilike('roll_number', trimmedRoll)
      .maybeSingle();

    if (studentErr) throw studentErr;

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'No student found with this roll number.',
      });
    }

    const authUser = await getOrCreateStudentAuthUser(student);

    if (authUser.user_metadata?.is_activated === true) {
      return res.status(400).json({
        status: 'error',
        message:
          'Account is already activated. Please sign in with your roll number and password.',
      });
    }

    const storedHash = authUser.user_metadata?.activation_code_hash;
    const expiresAt = authUser.user_metadata?.activation_expires_at;

    if (!storedHash || !verifyActivationCode(activation_code, storedHash)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid activation code. Please check and try again.',
      });
    }

    if (expiresAt && new Date(expiresAt) < new Date()) {
      return res.status(400).json({
        status: 'error',
        message: 'Activation code has expired. Please contact an administrator for a new code.',
      });
    }

    const hasVoice =
      student.voice_embedding !== null &&
      (!Array.isArray(student.voice_embedding) || student.voice_embedding.length > 0);

    return res.json({
      status: 'ok',
      message: 'Activation code verified successfully.',
      student: {
        id: student.id,
        name: student.name,
        roll_number: student.roll_number,
        department: student.department,
        voice_enrolled: hasVoice,
      },
    });
  } catch (err) {
    console.error('Activation verify error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to verify activation code.',
    });
  }
});

// ── POST /auth/activate/set-password ─────────────────────────────────
// Creates password for student during first-time activation, then logs them in.
app.post('/auth/activate/set-password', async (req, res) => {
  const { roll_number, activation_code, password, confirm_password } = req.body;

  if (!roll_number || !activation_code || !password || !confirm_password) {
    return res.status(400).json({
      status: 'error',
      message: 'Roll number, activation code, password, and confirmation are required.',
    });
  }

  if (password !== confirm_password) {
    return res.status(400).json({
      status: 'error',
      message: 'Password and confirm password do not match.',
    });
  }

  const strength = validatePasswordStrength(password);
  if (!strength.valid) {
    return res.status(400).json({
      status: 'error',
      message: strength.message,
    });
  }

  try {
    const trimmedRoll = String(roll_number).trim();
    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('id, name, roll_number, department, voice_embedding')
      .ilike('roll_number', trimmedRoll)
      .maybeSingle();

    if (studentErr) throw studentErr;

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'No student found with this roll number.',
      });
    }

    const authUser = await getOrCreateStudentAuthUser(student);

    if (authUser.user_metadata?.is_activated === true) {
      return res.status(400).json({
        status: 'error',
        message:
          'Account is already activated. Please sign in with your roll number and password.',
      });
    }

    const storedHash = authUser.user_metadata?.activation_code_hash;
    const expiresAt = authUser.user_metadata?.activation_expires_at;

    if (!storedHash || !verifyActivationCode(activation_code, storedHash)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid activation code. Please check and try again.',
      });
    }

    if (expiresAt && new Date(expiresAt) < new Date()) {
      return res.status(400).json({
        status: 'error',
        message: 'Activation code has expired. Please contact an administrator for a new code.',
      });
    }

    // Update password in Supabase Auth and mark as activated
    const { error: updateErr } = await supabase.auth.admin.updateUserById(authUser.id, {
      password,
      user_metadata: {
        ...authUser.user_metadata,
        is_activated: true,
        activation_code_hash: null,
        activation_expires_at: null,
        password_updated_at: new Date().toISOString(),
      },
    });

    if (updateErr) throw updateErr;

    // Sync state to students table and record activation audit if tables exist
    await syncStudentTableAuthState(student.id, {
      is_activated: true,
      activation_code_hash: null,
      activation_expires_at: null,
      password_updated_at: new Date().toISOString(),
      auth_user_id: authUser.id,
    });
    await recordActivationAudit(student.id, storedHash, expiresAt, new Date().toISOString());

    // Sign in immediately to establish session for next step (voice enrollment)
    const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
      email: authUser.email,
      password,
    });

    if (authError) throw authError;

    const hasVoice =
      student.voice_embedding !== null &&
      (!Array.isArray(student.voice_embedding) || student.voice_embedding.length > 0);

    return res.json({
      status: 'ok',
      message: 'Password created successfully. Please proceed to voice enrollment.',
      user: {
        id: student.id,
        student_id: student.id,
        name: student.name,
        roll_number: student.roll_number,
        department: student.department,
        role: 'student',
        is_admin: false,
        voice_enrolled: hasVoice,
      },
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      },
    });
  } catch (err) {
    console.error('Set password error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to create password.',
      detail: err.message,
    });
  }
});

// ── POST /students/change-password ──────────────────────────────────
// Allows an authenticated student to change their own password.
// Requires verification of current password.
app.post('/students/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;

  if (!current_password || !new_password || !confirm_password) {
    return res.status(400).json({
      status: 'error',
      message: 'Current password, new password, and confirmation are required.',
    });
  }

  if (new_password !== confirm_password) {
    return res.status(400).json({
      status: 'error',
      message: 'New password and confirmation do not match.',
    });
  }

  if (current_password === new_password) {
    return res.status(400).json({
      status: 'error',
      message: 'New password must be different from current password.',
    });
  }

  const strength = validatePasswordStrength(new_password);
  if (!strength.valid) {
    return res.status(400).json({
      status: 'error',
      message: strength.message,
    });
  }

  try {
    // 1. Verify current password by attempting sign-in
    const { error: signInErr } = await supabaseAuth.auth.signInWithPassword({
      email: req.user.email,
      password: current_password,
    });

    if (signInErr) {
      return res.status(401).json({
        status: 'error',
        message: 'Current password is incorrect.',
      });
    }

    // 2. Update to new password in Supabase Auth
    const { error: updateErr } = await supabase.auth.admin.updateUserById(req.user.id, {
      password: new_password,
      user_metadata: {
        ...req.user.user_metadata,
        password_updated_at: new Date().toISOString(),
      },
    });

    if (updateErr) throw updateErr;

    if (req.user.student_id) {
      await syncStudentTableAuthState(req.user.student_id, {
        password_updated_at: new Date().toISOString(),
      });
    }

    // Preserves voice_embedding and attendance history completely
    return res.json({
      status: 'ok',
      message: 'Password changed successfully.',
    });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to change password.',
      detail: err.message,
    });
  }
});

// ── GET /auth/me ────────────────────────────────────────────────────
// Returns the current user's info + whether they are an admin.
// Requires a valid JWT in the Authorization header.
app.get('/auth/me', requireAuth, async (req, res) => {
  try {
    const { data: adminRow } = await supabase
      .from('admins')
      .select('role')
      .or(`id.eq.${req.user.id},email.eq.${req.user.email || 'none'}`)
      .maybeSingle();

    let student = null;
    if (req.user.student_id) {
      const { data } = await supabase
        .from('students')
        .select('id, name, roll_number, department, voice_embedding')
        .eq('id', req.user.student_id)
        .maybeSingle();
      student = data;
    }
    if (!student && req.user.roll_number) {
      const { data } = await supabase
        .from('students')
        .select('id, name, roll_number, department, voice_embedding')
        .ilike('roll_number', String(req.user.roll_number).trim())
        .maybeSingle();
      student = data;
    }
    if (!student && req.user.id) {
      const { data } = await supabase
        .from('students')
        .select('id, name, roll_number, department, voice_embedding')
        .eq('id', req.user.id)
        .maybeSingle();
      student = data;
    }

    const hasVoice = student
      ? student.voice_embedding !== null &&
        student.voice_embedding !== undefined &&
        (!Array.isArray(student.voice_embedding) || student.voice_embedding.length > 0)
      : (req.user.user_metadata?.voice_enrolled || false);

    res.json({
      status: 'ok',
      user: {
        id: req.user.id,
        email: req.user.email,
        is_admin: !!adminRow || req.user.role === 'admin',
        role: adminRow?.role || req.user.role || 'student',
        student_id: student?.id || req.user.student_id || null,
        roll_number: student?.roll_number || req.user.roll_number || null,
        name: student?.name || req.user.user_metadata?.name || null,
        department: student?.department || req.user.user_metadata?.department || null,
        voice_enrolled: hasVoice,
      },
    });
  } catch (err) {
    res.json({
      status: 'ok',
      user: {
        id: req.user.id,
        email: req.user.email,
        is_admin: req.user.role === 'admin',
        role: req.user.role || 'student',
        student_id: req.user.student_id || null,
        roll_number: req.user.roll_number || null,
        voice_enrolled: req.user.user_metadata?.voice_enrolled || false,
      },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ADMIN ROUTES — require both auth + admin role
// ═══════════════════════════════════════════════════════════════════════

// ── POST /admin/students ────────────────────────────────────────────
// Add a new student. Admin only.
// Provisions the student and generates a secure one-time activation code.
app.post('/admin/students', requireAuth, requireAdmin, async (req, res) => {
  const { name, roll_number, department } = req.body;

  if (!name || !roll_number) {
    return res.status(400).json({
      status: 'error',
      message: 'Name and roll_number are required',
    });
  }

  try {
    // 1. Insert student into students table
    const { data, error } = await supabase
      .from('students')
      .insert({
        name: String(name).trim(),
        roll_number: String(roll_number).trim(),
        department: department ? String(department).trim() : null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505' || (error.message && error.message.includes('unique'))) {
        return res.status(409).json({
          status: 'error',
          message: `A student with roll number "${roll_number}" already exists.`,
        });
      }
      return res.status(400).json({
        status: 'error',
        message: error.message,
      });
    }

    // 2. Generate secure one-time activation code
    const activationCode = generateActivationCode();
    const activationHash = hashActivationCode(activationCode);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // 3. Create or prepare student auth account
    const authUser = await getOrCreateStudentAuthUser(data);
    await supabase.auth.admin.updateUserById(authUser.id, {
      user_metadata: {
        ...authUser.user_metadata,
        is_activated: false,
        activation_code_hash: activationHash,
        activation_expires_at: expiresAt,
      },
    });

    // Sync activation info to students and student_activations if columns/tables exist
    await syncStudentTableAuthState(data.id, {
      auth_user_id: authUser.id,
      is_activated: false,
      activation_code_hash: activationHash,
      activation_expires_at: expiresAt,
    });
    await recordActivationAudit(data.id, activationHash, expiresAt);

    res.json({
      status: 'ok',
      student: data,
      activation_code: activationCode,
      expires_at: expiresAt,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to add student',
      detail: err.message,
    });
  }
});

// ── POST /admin/students/:id/set-password ───────────────────────────
// Allows admin to set or reset a student's password.
// Admin supplies only a new password + confirmation; old password is never seen.
app.post('/admin/students/:id/set-password', requireAuth, requireAdmin, async (req, res) => {
  const studentId = req.params.id;
  const { new_password, confirm_password } = req.body;

  if (!new_password || !confirm_password) {
    return res.status(400).json({
      status: 'error',
      message: 'New password and confirmation are required.',
    });
  }

  if (new_password !== confirm_password) {
    return res.status(400).json({
      status: 'error',
      message: 'New password and confirmation do not match.',
    });
  }

  const strength = validatePasswordStrength(new_password);
  if (!strength.valid) {
    return res.status(400).json({
      status: 'error',
      message: strength.message,
    });
  }

  try {
    // 1. Verify student exists in students table
    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('id, name, roll_number, department')
      .eq('id', studentId)
      .maybeSingle();

    if (studentErr) throw studentErr;

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found.',
      });
    }

    // 2. Resolve or create auth user
    const authUser = await getOrCreateStudentAuthUser(student);

    // 3. Update password in Supabase Auth
    const { error: updateErr } = await supabase.auth.admin.updateUserById(authUser.id, {
      password: new_password,
      user_metadata: {
        ...authUser.user_metadata,
        is_activated: true,
        activation_code_hash: null,
        activation_expires_at: null,
        password_updated_at: new Date().toISOString(),
      },
    });

    if (updateErr) throw updateErr;

    // Sync password timestamp and activation state to students table if columns exist
    await syncStudentTableAuthState(student.id, {
      is_activated: true,
      activation_code_hash: null,
      activation_expires_at: null,
      password_updated_at: new Date().toISOString(),
      auth_user_id: authUser.id,
    });

    // Preserves voice_embedding, name, roll_number, department, and attendance
    return res.json({
      status: 'ok',
      message: `Password updated successfully for student ${student.name}.`,
    });
  } catch (err) {
    console.error('Admin set password error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update student password.',
      detail: err.message,
    });
  }
});

// ── POST /admin/students/:id/generate-activation ────────────────────
// Generates a new single-use activation code for a student.
app.post('/admin/students/:id/generate-activation', requireAuth, requireAdmin, async (req, res) => {
  const studentId = req.params.id;

  try {
    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('id, name, roll_number, department')
      .eq('id', studentId)
      .maybeSingle();

    if (studentErr) throw studentErr;

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found.',
      });
    }

    const activationCode = generateActivationCode();
    const activationHash = hashActivationCode(activationCode);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const authUser = await getOrCreateStudentAuthUser(student);

    const { error: updateErr } = await supabase.auth.admin.updateUserById(authUser.id, {
      user_metadata: {
        ...authUser.user_metadata,
        is_activated: false,
        activation_code_hash: activationHash,
        activation_expires_at: expiresAt,
      },
    });

    if (updateErr) throw updateErr;

    // Sync activation state and audit record to tables if present
    await syncStudentTableAuthState(student.id, {
      is_activated: false,
      activation_code_hash: activationHash,
      activation_expires_at: expiresAt,
      auth_user_id: authUser.id,
    });
    await recordActivationAudit(student.id, activationHash, expiresAt);

    return res.json({
      status: 'ok',
      message: 'Activation code generated successfully.',
      activation_code: activationCode,
      expires_at: expiresAt,
      student: {
        id: student.id,
        name: student.name,
        roll_number: student.roll_number,
      },
    });
  } catch (err) {
    console.error('Generate activation error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to generate activation code.',
      detail: err.message,
    });
  }
});

// ── DELETE /admin/students/:id ──────────────────────────────────────
// Remove a student. Admin only.
app.delete('/admin/students/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      return res.status(400).json({
        status: 'error',
        message: error.message,
      });
    }

    res.json({ status: 'ok', message: 'Student removed' });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to remove student',
      detail: err.message,
    });
  }
});

// ── POST /admin/students/:id/reset-voice ────────────────────────────
// Reset a student's voice embedding. Admin only.
// Password and attendance history are strictly preserved.
app.post('/admin/students/:id/reset-voice', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase
      .from('students')
      .update({ voice_embedding: null })
      .eq('id', req.params.id);

    if (error) {
      return res.status(400).json({
        status: 'error',
        message: error.message,
      });
    }

    // Synchronize auth user metadata if student auth user exists
    try {
      const authUser = await findAuthUserByStudentId(req.params.id);
      if (authUser) {
        await supabase.auth.admin.updateUserById(authUser.id, {
          user_metadata: {
            ...authUser.user_metadata,
            voice_enrolled: false,
          },
        });
      }
    } catch (_) {}

    res.json({ status: 'ok', message: 'Voice data reset successfully' });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to reset voice data',
      detail: err.message,
    });
  }
});

// ── GET /admin/students ─────────────────────────────────────────────
// List all students. Admin only.
app.get('/admin/students', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('id, name, roll_number, department, voice_embedding, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Don't send raw embeddings to the frontend — just whether one exists
    const students = (data || []).map(s => ({
      id: s.id,
      name: s.name,
      roll_number: s.roll_number,
      department: s.department,
      created_at: s.created_at,
      voice_enrolled: s.voice_embedding !== null && (!Array.isArray(s.voice_embedding) || s.voice_embedding.length > 0),
    }));

    res.json({ status: 'ok', students });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch students',
      detail: err.message,
    });
  }
});

// ── PUT /admin/students/:id ──────────────────────────────────────
// Edit an existing student's details. Admin only.
// Validates name (1-100), roll_number (1-50), department (0-100, optional).
// Only updates fields actually supplied. Checks duplicate roll number (409).
// Returns updated student with voice_enrolled boolean, never exposing voice_embedding.
app.put('/admin/students/:id', requireAuth, requireAdmin, async (req, res) => {
  const studentId = req.params.id;

  // 1. Validate request body is an object
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid request body.',
    });
  }

  const { name, roll_number, department } = req.body;

  // Must provide at least one allowed field
  const hasName = 'name' in req.body;
  const hasRollNumber = 'roll_number' in req.body;
  const hasDepartment = 'department' in req.body;

  if (!hasName && !hasRollNumber && !hasDepartment) {
    return res.status(400).json({
      status: 'error',
      message: 'At least one field (name, roll_number, department) must be provided.',
    });
  }

  const updates = {};

  // 2. Field validation: name (1–100 chars)
  if (hasName) {
    if (typeof name !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Name must be between 1 and 100 characters.',
      });
    }
    const trimmedName = name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 100) {
      return res.status(400).json({
        status: 'error',
        message: 'Name must be between 1 and 100 characters.',
      });
    }
    updates.name = trimmedName;
  }

  // 3. Field validation: roll_number (1–50 chars)
  if (hasRollNumber) {
    if (typeof roll_number !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Roll number must be between 1 and 50 characters.',
      });
    }
    const trimmedRoll = roll_number.trim();
    if (trimmedRoll.length < 1 || trimmedRoll.length > 50) {
      return res.status(400).json({
        status: 'error',
        message: 'Roll number must be between 1 and 50 characters.',
      });
    }
    updates.roll_number = trimmedRoll;
  }

  // 4. Field validation: department (0–100 chars, optional)
  if (hasDepartment) {
    if (department === null) {
      updates.department = null;
    } else if (typeof department === 'string') {
      const trimmedDept = department.trim();
      if (trimmedDept.length > 100) {
        return res.status(400).json({
          status: 'error',
          message: 'Department must be between 0 and 100 characters.',
        });
      }
      updates.department = trimmedDept;
    } else {
      return res.status(400).json({
        status: 'error',
        message: 'Department must be between 0 and 100 characters.',
      });
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      status: 'error',
      message: 'At least one field (name, roll_number, department) must be provided.',
    });
  }

  try {
    // 5. Check if student exists
    const { data: existingStudent, error: fetchErr } = await supabase
      .from('students')
      .select('id, name, roll_number, department, voice_embedding, created_at')
      .eq('id', studentId)
      .maybeSingle();

    if (fetchErr) {
      console.error('Fetch student error:', fetchErr);
      return res.status(500).json({
        status: 'error',
        message: 'Database query failed. Please try again.',
        detail: fetchErr.message,
      });
    }

    if (!existingStudent) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found.',
      });
    }

    // 6. Check duplicate roll number if roll_number is being changed
    if (updates.roll_number && updates.roll_number !== existingStudent.roll_number) {
      const { data: duplicateStudent, error: dupErr } = await supabase
        .from('students')
        .select('id')
        .eq('roll_number', updates.roll_number)
        .neq('id', studentId)
        .maybeSingle();

      if (dupErr) {
        console.error('Duplicate check error:', dupErr);
      }

      if (duplicateStudent) {
        return res.status(409).json({
          status: 'error',
          message: 'A student with this roll number already exists.',
        });
      }
    }

    // 7. Perform partial update
    const { data: updated, error: updateErr } = await supabase
      .from('students')
      .update(updates)
      .eq('id', studentId)
      .select('id, name, roll_number, department, voice_embedding, created_at')
      .single();

    if (updateErr) {
      if (updateErr.code === '23505' || /unique|duplicate/i.test(updateErr.message)) {
        return res.status(409).json({
          status: 'error',
          message: 'A student with this roll number already exists.',
        });
      }
      console.error('Update student error:', updateErr);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to update student',
        detail: updateErr.message,
      });
    }

    const voiceEnrolled =
      updated.voice_embedding !== null &&
      updated.voice_embedding !== undefined &&
      (!Array.isArray(updated.voice_embedding) || updated.voice_embedding.length > 0);

    res.json({
      id: updated.id,
      name: updated.name,
      roll_number: updated.roll_number,
      department: updated.department,
      voice_enrolled: voiceEnrolled,
      created_at: updated.created_at,
    });
  } catch (err) {
    console.error('Update student unexpected error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update student',
      detail: err.message,
    });
  }
});

// ── GET /admin/attendance ────────────────────────────────────────
// ── GET /admin/attendance ────────────────────────────────────────
// Returns all attendance logs with joined student details. Admin only.
// Optional query filters: student_id, date.
// Returns up to 1000 records, sorted by date descending and time descending.
// Never exposes voice_embedding.
app.get('/admin/attendance', requireAuth, requireAdmin, async (req, res) => {
  const { student_id, date, date_from, date_to, status } = req.query;

  // 1. Validate student_id format if provided (UUID)
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (student_id !== undefined) {
    if (typeof student_id !== 'string' || !UUID_REGEX.test(student_id.trim())) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid student_id format.',
      });
    }
  }

  // 2. Validate date format if provided (YYYY-MM-DD)
  if (date !== undefined) {
    const isValidDateString = (str) => {
      if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
      const [y, m, d] = str.split('-').map(Number);
      const dateObj = new Date(Date.UTC(y, m - 1, d));
      return (
        dateObj.getUTCFullYear() === y &&
        dateObj.getUTCMonth() === m - 1 &&
        dateObj.getUTCDate() === d
      );
    };

    if (!isValidDateString(date.trim())) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid date format. Use YYYY-MM-DD.',
      });
    }
  }

  try {
    // 3. Build filtered attendance query with 1000-record limit
    let query = supabase
      .from('attendance')
      .select('id, student_id, date, time, status, verification_score')
      .order('date', { ascending: false })
      .order('time', { ascending: false })
      .limit(1000);

    if (student_id) query = query.eq('student_id', student_id.trim());
    if (date) query = query.eq('date', date.trim());
    if (date_from && !date) query = query.gte('date', date_from);
    if (date_to && !date) query = query.lte('date', date_to);
    if (status) query = query.eq('status', status);

    const { data: records, error: recordsErr } = await query;
    if (recordsErr) {
      console.error('Admin attendance log query error:', recordsErr);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to fetch attendance logs',
        detail: recordsErr.message,
      });
    }

    if (!records || records.length === 0) {
      return res.json([]);
    }

    // 4. Fetch student details (never select voice_embedding)
    const uniqueStudentIds = [...new Set(records.map((r) => r.student_id).filter(Boolean))];
    let studentMap = {};

    if (uniqueStudentIds.length > 0) {
      const { data: students, error: studentsErr } = await supabase
        .from('students')
        .select('id, name, roll_number')
        .in('id', uniqueStudentIds);

      if (!studentsErr && students) {
        students.forEach((s) => {
          studentMap[s.id] = s;
        });
      }
    }

    // 5. Enrich attendance records with student name & roll number
    const enriched = records.map((r) => {
      const student = studentMap[r.student_id];
      return {
        id: r.id,
        student_id: r.student_id,
        student_name: student?.name || 'Unknown',
        roll_number: student?.roll_number || '—',
        date: r.date,
        time: r.time,
        status: r.status,
        verification_score: r.verification_score,
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('Admin attendance log error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch attendance logs',
      detail: err.message,
    });
  }
});

// ── Start server ────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
    console.log(`Test DB connection: http://localhost:${PORT}/health/db`);
  });
}

module.exports = app;

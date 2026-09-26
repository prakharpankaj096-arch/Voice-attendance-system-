// Voice Attendance System — Node.js Backend
// Entry point: Express server with auth, health, stats, and admin routes.

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { supabase, supabaseAuth } = require('./supabaseClient');
const { requireAuth, requireAdmin } = require('./middleware/auth');

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

// ═══════════════════════════════════════════════════════════════════════
// VOICE & ATTENDANCE ROUTES
// ═══════════════════════════════════════════════════════════════════════

// ── POST /students/enroll ───────────────────────────────────────────
// Enrolls a student: receives name, roll_number, department, and 5 audio files.
// Forwards the audio to the Python voice-service to generate the 192-dim centroid,
// then saves the student with their voice embedding in Supabase.
app.post('/students/enroll', upload.array('audio_files', 5), async (req, res) => {
  const { name, roll_number, department } = req.body;

  if (!name || !roll_number) {
    return res.status(400).json({
      status: 'error',
      message: 'Name and roll number are required',
    });
  }

  if (!req.files || req.files.length < 5) {
    return res.status(400).json({
      status: 'error',
      message: `Expected 5 audio files for enrollment, received ${req.files ? req.files.length : 0}`,
    });
  }

  try {
    // 1. Check if roll number already exists
    const { data: existing } = await supabase
      .from('students')
      .select('id, name')
      .eq('roll_number', roll_number)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        status: 'error',
        message: `Student with roll number "${roll_number}" is already registered (${existing.name}).`,
      });
    }

    // 2. Build FormData to forward audio to voice-service /enroll
    const formData = new FormData();
    formData.append('student_id', roll_number);

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

    // 3. Save student to Supabase
    const { data: student, error: insertErr } = await supabase
      .from('students')
      .insert({
        name,
        roll_number,
        department: department || null,
        voice_embedding: voiceData.embedding,
      })
      .select('id, name, roll_number, department, created_at')
      .single();

    if (insertErr) throw insertErr;

    res.json({
      status: 'ok',
      message: 'Student enrolled and voiceprint saved successfully',
      student,
      embedding_dim: voiceData.dimension,
      avg_internal_similarity: voiceData.avg_internal_similarity,
      quality_reports: voiceData.quality_reports,
    });
  } catch (err) {
    console.error('Enrollment error:', err);
    res.status(500).json({
      status: 'error',
      message: err.message || 'Enrollment failed',
    });
  }
});

// ── POST /attendance/mark ───────────────────────────────────────────
// Receives 1 audio file from the user.
// Queries Supabase for all enrolled students with voice embeddings.
// Forwards audio + candidates to voice-service /verify.
// If best match score >= 0.75:
//   Inserts attendance record into Supabase (if not already marked today).
// Returns dialogue message matching AI_ASSISTANT.md.
app.post('/attendance/mark', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      status: 'error',
      message: 'Audio file is required to mark attendance',
    });
  }

  try {
    // 1. Fetch all students who have voice embeddings
    const { data: students, error: fetchErr } = await supabase
      .from('students')
      .select('id, name, roll_number, voice_embedding')
      .not('voice_embedding', 'is', null);

    if (fetchErr) throw fetchErr;

    if (!students || students.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No enrolled students found in database. Please enroll first.',
      });
    }

    // 2. Prepare candidates array
    const candidates = students.map(s => ({
      id: s.id,
      name: s.name,
      roll_number: s.roll_number,
      voice_embedding: s.voice_embedding,
    }));

    // 3. Send to voice-service /verify
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
    const MATCH_THRESHOLD = 0.75;

    // 4. Verification decision
    if (best_match && score >= MATCH_THRESHOLD) {
      const today = new Date().toISOString().slice(0, 10);

      // Check if already marked present today
      const { data: existingAttendance } = await supabase
        .from('attendance')
        .select('id, time')
        .eq('student_id', best_match.id)
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
          quality,
          message: `I recognized you as ${best_match.name}. Voice verified (confidence: ${Math.round(score * 100)}%). You are already marked present today.`,
        });
      }

      // Mark attendance
      const { data: record, error: markErr } = await supabase
        .from('attendance')
        .insert({
          student_id: best_match.id,
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
        quality,
        attendance_record: record,
        message: `I recognized you as ${best_match.name}. Voice verified (confidence: ${Math.round(score * 100)}%). Attendance marked successfully.`,
      });
    } else {
      // Rejection
      const topScoreText = score > 0 ? ` (Best match score: ${score.toFixed(2)}, required: ${MATCH_THRESHOLD})` : '';
      return res.json({
        status: 'ok',
        matched: false,
        student: best_match || null,
        score,
        transcription,
        quality,
        message: `I couldn't verify your voice with enough confidence${topScoreText}. Please speak clearly and try again.`,
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
// Signs in with email + password, returns JWT tokens.
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: 'error',
      message: 'Email and password are required',
    });
  }

  try {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({
        status: 'error',
        message: error.message,
      });
    }

    res.json({
      status: 'ok',
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Login failed',
      detail: err.message,
    });
  }
});

// ── GET /auth/me ────────────────────────────────────────────────────
// Returns the current user's info + whether they are an admin.
// Requires a valid JWT in the Authorization header.
app.get('/auth/me', requireAuth, async (req, res) => {
  try {
    // Check if user is in admins table
    const { data: adminRow } = await supabase
      .from('admins')
      .select('role')
      .eq('id', req.user.id)
      .single();

    res.json({
      status: 'ok',
      user: {
        id: req.user.id,
        email: req.user.email,
        is_admin: !!adminRow,
        role: adminRow?.role || 'student',
      },
    });
  } catch (err) {
    // If admins table doesn't exist or query fails, user is just not admin
    res.json({
      status: 'ok',
      user: {
        id: req.user.id,
        email: req.user.email,
        is_admin: false,
        role: 'student',
      },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ADMIN ROUTES — require both auth + admin role
// ═══════════════════════════════════════════════════════════════════════

// ── POST /admin/students ────────────────────────────────────────────
// Add a new student. Admin only.
app.post('/admin/students', requireAuth, requireAdmin, async (req, res) => {
  const { name, roll_number, department } = req.body;

  if (!name || !roll_number) {
    return res.status(400).json({
      status: 'error',
      message: 'Name and roll_number are required',
    });
  }

  try {
    const { data, error } = await supabase
      .from('students')
      .insert({ name, roll_number, department: department || null })
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        status: 'error',
        message: error.message,
      });
    }

    res.json({ status: 'ok', student: data });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to add student',
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
      ...s,
      voice_enrolled: s.voice_embedding !== null,
      voice_embedding: undefined,
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

// ── Start server ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Test DB connection: http://localhost:${PORT}/health/db`);
});

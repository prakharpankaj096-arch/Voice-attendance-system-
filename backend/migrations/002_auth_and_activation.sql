-- ==============================================================================
-- Migration 002: Authentication, Activation, and Security Hardening
-- Description: Adds auth user linkage, single-use activation tracking, admin identifiers,
--              Row Level Security (RLS) policies, and safe student view.
-- Target Database: Supabase PostgreSQL
-- Idempotency: Fully idempotent. Safe to run multiple times without data destruction.
-- ==============================================================================

-- ── 1. Extend students table ──────────────────────────────────────────────────
-- Adds auth linkage, activation tracking, and password timestamp
ALTER TABLE public.students 
    ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_activated BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS activation_code_hash TEXT,
    ADD COLUMN IF NOT EXISTS activation_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMPTZ;

-- Case-insensitive unique index for student roll numbers (ensures no duplicates like 'cs-101' and 'CS-101')
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_roll_number_lower 
    ON public.students (LOWER(roll_number));

-- Index for fast lookup by auth_user_id
CREATE INDEX IF NOT EXISTS idx_students_auth_user_id 
    ON public.students (auth_user_id);

-- ── 2. Extend admins table ────────────────────────────────────────────────────
-- Adds customizable administrative identifier (e.g. 'admin', 'cse_admin')
ALTER TABLE public.admins
    ADD COLUMN IF NOT EXISTS admin_id TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Case-insensitive unique index for admin_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_admin_id_lower 
    ON public.admins (LOWER(admin_id))
    WHERE admin_id IS NOT NULL;

-- ── 3. Dedicated student_activations table (Audit Trail & Single-Use) ──────────
CREATE TABLE IF NOT EXISTS public.student_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    activation_code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_activations_student_id 
    ON public.student_activations (student_id);

CREATE INDEX IF NOT EXISTS idx_student_activations_expires_at 
    ON public.student_activations (expires_at);

-- ── 4. Secure View: students_safe ─────────────────────────────────────────────
-- Returns student profile information while strictly excluding voice_embedding
CREATE OR REPLACE VIEW public.students_safe AS
SELECT 
    id,
    name,
    roll_number,
    department,
    created_at,
    (voice_embedding IS NOT NULL AND array_length(voice_embedding, 1) > 0) AS voice_enrolled,
    is_activated
FROM public.students;

-- ── 5. Backfill Existing Records ──────────────────────────────────────────────
-- Assign default admin_id 'admin' to existing admin record if unset
UPDATE public.admins 
SET admin_id = 'admin', updated_at = NOW() 
WHERE admin_id IS NULL;

-- Link existing student to auth user if matching user exists in auth.users
UPDATE public.students s
SET auth_user_id = u.id
FROM auth.users u
WHERE (u.raw_user_meta_data->>'student_id')::uuid = s.id
  AND s.auth_user_id IS NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_activations ENABLE ROW LEVEL SECURITY;

-- ── Policies for public.admins ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can view admin table" ON public.admins;
CREATE POLICY "Admins can view admin table"
    ON public.admins
    FOR SELECT
    USING (
        auth.uid() = id OR 
        EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid())
    );

-- ── Policies for public.students ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Students can view own profile" ON public.students;
CREATE POLICY "Students can view own profile"
    ON public.students
    FOR SELECT
    USING (
        auth.uid() = auth_user_id OR 
        EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Admins can insert students" ON public.students;
CREATE POLICY "Admins can insert students"
    ON public.students
    FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Admins can update students" ON public.students;
CREATE POLICY "Admins can update students"
    ON public.students
    FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Admins can delete students" ON public.students;
CREATE POLICY "Admins can delete students"
    ON public.students
    FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid())
    );

-- ── Policies for public.attendance ────────────────────────────────────────────
DROP POLICY IF EXISTS "Students can view own attendance" ON public.attendance;
CREATE POLICY "Students can view own attendance"
    ON public.attendance
    FOR SELECT
    USING (
        student_id IN (
            SELECT id FROM public.students WHERE auth_user_id = auth.uid()
        ) OR 
        EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Attendance can be marked by service or admin" ON public.attendance;
CREATE POLICY "Attendance can be marked by service or admin"
    ON public.attendance
    FOR INSERT
    WITH CHECK (
        student_id IN (
            SELECT id FROM public.students WHERE auth_user_id = auth.uid()
        ) OR 
        EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid())
    );

-- ── Policies for public.student_activations ───────────────────────────────────
DROP POLICY IF EXISTS "Admins can view activation records" ON public.student_activations;
CREATE POLICY "Admins can view activation records"
    ON public.student_activations
    FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Admins can create activation records" ON public.student_activations;
CREATE POLICY "Admins can create activation records"
    ON public.student_activations
    FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid())
    );

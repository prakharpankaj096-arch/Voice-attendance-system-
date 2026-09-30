-- ==============================================================================
-- Migration 001: Initial Schema Baseline
-- Description: Core tables for Voice Attendance System (students, admins, attendance)
-- Target Database: Supabase PostgreSQL
-- ==============================================================================

-- 1. Table: students
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    roll_number TEXT NOT NULL UNIQUE,
    voice_embedding DOUBLE PRECISION[],
    department TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table: admins
CREATE TABLE IF NOT EXISTS public.admins (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'admin'
);

-- 3. Table: attendance
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
    verification_score DOUBLE PRECISION
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance (date);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance (student_id);
CREATE INDEX IF NOT EXISTS idx_students_roll_number ON public.students (roll_number);

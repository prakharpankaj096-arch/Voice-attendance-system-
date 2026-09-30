# Database Schema

Database: **Supabase (PostgreSQL)**

## Table: `students`

| Column | Type | Notes |
|---|---|---|
| id | uuid, primary key | auto-generated (gen_random_uuid()) |
| name | text | student full name |
| roll_number | text, unique | student roll number (case-insensitive unique index) |
| voice_embedding | float8[] (array) | 192-dim centroid embedding from SpeechBrain ECAPA-TDNN |
| department | text | optional department (e.g., Computer Science) |
| auth_user_id | uuid, nullable | references `auth.users(id)` in Supabase Auth |
| is_activated | boolean | default `false`; becomes `true` after first-time activation |
| activation_code_hash | text | SHA-256 hash of single-use activation code (null once activated) |
| activation_expires_at | timestamptz | expiration timestamp for activation code |
| password_updated_at | timestamptz | timestamp when password was last changed |
| created_at | timestamptz | default `now()` |

## Table: `admins`

| Column | Type | Notes |
|---|---|---|
| id | uuid, primary key | linked to Supabase Auth user (`auth.users.id`) |
| email | text, unique | admin email address |
| admin_id | text, unique | administrative identifier (e.g. `admin`, `admin01`) |
| role | text | 'admin' |
| updated_at | timestamptz | default `now()` |

## Table: `attendance`

| Column | Type | Notes |
|---|---|---|
| id | uuid, primary key | auto-generated (gen_random_uuid()) |
| student_id | uuid, foreign key → students.id | student attendance record |
| date | date | attendance date (YYYY-MM-DD) |
| time | timestamptz | exact timestamp marked |
| status | text | 'present' / 'absent' |
| verification_score | float8 | cosine similarity score at time of match (>= 0.75 threshold) |

## Table: `student_activations` (Audit & History)

| Column | Type | Notes |
|---|---|---|
| id | uuid, primary key | auto-generated |
| student_id | uuid, foreign key → students.id | linked student |
| activation_code_hash | text | SHA-256 hash of single-use activation code |
| expires_at | timestamptz | expiration date/time (7 days) |
| used_at | timestamptz | timestamp when used (null if pending) |
| created_at | timestamptz | default `now()` |

## Relationships
- `attendance.student_id` → `students.id` (one student, many attendance records)
- `student_activations.student_id` → `students.id` (one student, many activation logs)
- `students.auth_user_id` → `auth.users.id` (student identity mapping)
- `admins.id` → `auth.users.id` (admin identity mapping)

## Indexes
- Unique index on `LOWER(students.roll_number)`
- Index on `students.auth_user_id`
- Unique index on `LOWER(admins.admin_id)`
- Index on `attendance.date` (dashboard queries filter by "today")
- Index on `attendance.student_id` (for per-student % calculations)
- Compound index on `(student_id, date, status)` (for duplicate attendance checks)
- Index on `student_activations.student_id` and `student_activations.expires_at`

## Row Level Security (RLS) Policies
- `students`: Students can SELECT only their own row (`auth.uid() = auth_user_id`). Admins can SELECT/INSERT/UPDATE/DELETE all rows.
- `attendance`: Students can SELECT only their own attendance (`student_id` belongs to `auth.uid()`). Admins can access all records.
- `admins`: Only authenticated admins can query admin records.
- `student_activations`: Restricted to admin and service-role access only.

## Privacy & Security Invariants
- `voice_embedding` is strictly numeric vector data; never return raw audio files or embeddings to public client endpoints.
- Passwords are never stored in plaintext or exposed in API responses or JWT payloads. All credentials are encrypted with bcrypt via Supabase Auth.
- Activation codes are stored as SHA-256 hashes with system-level salting, never in plaintext.

# Database Schema

Database: **Supabase (PostgreSQL)**

## Table: `students`

| Column | Type | Notes |
|---|---|---|
| id | uuid, primary key | auto-generated |
| name | text | student full name |
| roll_number | text, unique | |
| voice_embedding | float8[] (array) or jsonb | the averaged/centroid embedding vector from the 5 enrollment samples — see `VOICE_AUTHENTICATION.md` |
| department | text | optional, useful for filtering |
| created_at | timestamptz | default now() |

## Table: `attendance`

| Column | Type | Notes |
|---|---|---|
| id | uuid, primary key | auto-generated |
| student_id | uuid, foreign key → students.id | |
| date | date | attendance date |
| time | timestamptz | exact timestamp marked |
| status | text | 'present' / 'absent' |
| verification_score | float8 | cosine similarity score at time of match, store for later analysis/report metrics |

## Table: `admins` (optional — can also use a boolean flag on a users table via Supabase Auth)

| Column | Type | Notes |
|---|---|---|
| id | uuid, primary key | linked to Supabase Auth user |
| email | text | |
| role | text | 'admin' |

## Relationships
- `attendance.student_id` → `students.id` (one student, many attendance records)

## Indexes to add
- Unique index on `students.roll_number`
- Index on `attendance.date` (dashboard queries filter by "today" constantly)
- Index on `attendance.student_id` (for per-student % calculations)

## Notes for the AI coding assistant
- Store `voice_embedding` as a fixed-length numeric array (embedding size depends on the model — SpeechBrain ECAPA-TDNN produces 192-dim vectors, Resemblyzer produces 256-dim). Confirm the dimension once the model is chosen and keep it consistent.
- Do NOT store raw audio files permanently unless explicitly required for the report's testing section — store only the embeddings, to save space and avoid privacy concerns. If you need to keep sample recordings for testing/demo purposes, store them separately in `voice-service/enrollment_audio/` (local, not in the database).

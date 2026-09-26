# UI Requirements

## Pages

### 1. Login / Signup
- Student signup: Name, Roll Number, then redirect to Voice Enrollment
- Login via Supabase Auth (email/roll number + password, or magic link — keep simple)

### 2. Voice Enrollment (first-time students only)
- Step-by-step recorder: shows one phrase at a time (of the 5 from `VOICE_AUTHENTICATION.md`), record button, playback to confirm, re-record option, then "Next phrase"
- Progress indicator: "Sample 2 of 5"
- On completion: "Voice profile created successfully"

### 3. Dashboard (landing page after login)
```
-----------------------------------
VOICE ATTENDANCE SYSTEM
-----------------------------------
Total Students: 350
Present Today: 280
Absent Today: 70
Attendance Rate: 80%
-----------------------------------
[🎤 Mark Attendance]
[📊 View Attendance]
[🔍 Search Student]
[➕ Add Student]   ← admin only, hidden for students
-----------------------------------
```
Stats pull live from the `attendance` table for today's date.

### 4. Mark Attendance page
- Large mic button, recording state indicator (listening.../processing...)
- Transcript display (what was heard)
- AI response display + spoken via TTS
- Confirmation step before final save (per the dialogue flow)
- Success/failure state clearly shown

### 5. View Attendance page
- Student view: table of their own attendance history (date, status), plus % shown prominently at top
- Admin view: filterable by student/date, exportable if time permits (nice-to-have, not required)

### 6. Search Student page
- Search bar (text or voice input)
- Results show: name, roll number, attendance %
- No admin-only data (e.g. no raw embeddings) shown here

### 7. Admin Panel (hidden route, e.g. `/admin`, not in student nav)
- Add Student form (name, roll number → triggers enrollment flow for that student)
- Student list with Edit / Remove / Reset Voice Data actions
- All-students attendance log view

## Design notes
- Keep it clean and functional — a college mini project is judged on working functionality and clarity, not visual polish. A simple, readable layout (basic component library like shadcn/ui or plain Tailwind) is more than enough.
- Make the mic recording state very visually obvious (color change, pulsing icon) — this matters a lot for a live demo/viva where evaluators are watching.
- Show the verification confidence score somewhere visible during demo mode (e.g. small text under the response) — useful for explaining the system live and doesn't need to be hidden like a production app would.

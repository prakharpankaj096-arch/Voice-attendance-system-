# Project Specification — Voice Attendance System with AI Assistant

## 1. Overview

A student-only web application that marks attendance via voice biometric verification and answers attendance-related questions through a conversational assistant.

## 2. User Roles

| Role | Access |
|---|---|
| Student | Enroll voice, mark attendance, check own attendance %, search students |
| Admin (hidden) | Add/remove/edit students, reset voice data, view all attendance records |

## 3. Core Features

### 3.1 Student Enrollment
- Student provides: Name, Roll Number, 5 voice samples
- System generates a voice embedding (voiceprint) from the samples and stores it
- See `VOICE_AUTHENTICATION.md` for exact sample phrases and embedding process

### 3.2 Mark Attendance (voice flow)

```
Student: "Prakhar Pankaj Present"
   ↓ Speech Recognition (Whisper)
   ↓ Extract Speaker Features (SpeechBrain/Pyannote)
   ↓ Match against enrolled voiceprints
   ↓ Match found above confidence threshold?
        YES → Confirm identity → ask for confirmation → mark attendance → save
        NO  → reject, ask student to try again or contact admin
```

Example dialogue:
```
Student: "Prakhar Pankaj Present"
AI: "I recognized you as Prakhar Pankaj. Voice verified.
     Do you want to mark attendance?"
Student: "Yes"
AI: "Attendance marked successfully."
```

### 3.3 Check Attendance Percentage
```
Student: "What is my attendance percentage?"
AI: "Your attendance is 84%."
```

### 3.4 Search Student
```
Student: "Search Prakhar Pankaj"
AI: → returns student's name, roll number, attendance % (no sensitive data)
```

### 3.5 Admin Functions (hidden route, not linked from student nav)
- Add Student
- Remove Student
- Edit Student
- Reset Voice Data (re-enrollment)
- View all attendance logs (filter by date/student)

### 3.6 Dashboard (landing page)
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
[➕ Add Student]   (admin only)
```

## 4. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React / Next.js | Student + admin UI, mic recording via browser API |
| Backend | Node.js (Express) | Auth, student/attendance CRUD, calls voice microservice |
| Voice Microservice | Python (FastAPI) | Whisper (STT) + SpeechBrain/Pyannote (speaker verification) — **required**, Node cannot run these libraries |
| Database | Supabase (PostgreSQL) | Students, attendance, auth |
| Voice Recording | Browser MediaRecorder API | Captures mic audio, sends as blob |
| Speech-to-Text | OpenAI Whisper | Runs in the Python microservice |
| Speaker Verification | SpeechBrain or Pyannote | Pretrained speaker embedding models |
| AI Assistant (conversational replies) | OpenAI API | Turns intent + data into natural spoken/text responses |
| Authentication | Supabase Auth | Student login, admin role flag |

## 5. Non-Functional Requirements
- Voice verification should reject clearly mismatched voices (test with at least 10 enrolled students)
- End-to-end response time (speak → attendance confirmed) should stay under ~5 seconds for a usable demo
- System must work with a normal laptop/browser mic — no special hardware required

## 6. Out of Scope (mention as future scope in report)
- Anti-spoofing against recorded/played-back audio
- Multi-language support
- Mobile native app (web only)

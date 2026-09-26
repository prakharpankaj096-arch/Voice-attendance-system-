# Voice Attendance System with AI Assistant

A student-facing web application that marks classroom attendance using **voice biometric verification** (not just speech-to-text), plus a conversational assistant for attendance queries.

Built as a college mini project — Dept. of CSE.

## Why voice biometrics, not just speech-to-text

A system that only converts speech to text can be tricked: if Student A says "Prakhar Pankaj Present," a friend can say the exact same sentence and the text would match identically. This system instead extracts **speaker-specific voice features** (pitch, timbre, resonance patterns) and matches them against an enrolled voiceprint — so the words alone are never enough to mark someone else present.

## What it does

1. Students enroll once by recording 5 short voice samples → system builds a voice profile (embedding).
2. To mark attendance, a student speaks a phrase like *"Prakhar Pankaj Present"*.
3. System transcribes the speech, extracts voice features, matches against the database, confirms identity, and marks attendance.
4. Students can also ask the assistant things like *"What is my attendance percentage?"* or *"Search Prakhar Pankaj"*.
5. Admins (hidden role) can add/edit/remove students and reset voice data.

## Documentation

| File | Purpose |
|---|---|
| `PROJECT_SPEC.md` | Full feature list, user flows, tech stack |
| `DATABASE_SCHEMA.md` | Tables, columns, relationships |
| `VOICE_AUTHENTICATION.md` | How voice enrollment & verification actually works |
| `AI_ASSISTANT.md` | Conversational assistant flows and sample dialogues |
| `UI_REQUIREMENTS.md` | Pages, components, dashboard layout |
| `TODO.md` | Phased build checklist |
| `AI_INSTRUCTIONS.md` | Rules for the AI coding assistant (Antigravity) building this — read this first |

## Architecture (short version)

```
Frontend (React / Next.js)
        ↓
Node.js Backend (auth, students, attendance logic, Supabase calls)
        ↓  calls internally over HTTP
Python Microservice (FastAPI) — Whisper (speech-to-text) + SpeechBrain/Pyannote (speaker verification)
        ↓
Returns: transcribed text + speaker match result + confidence score
```

Node.js **cannot** run the voice ML libraries directly (they're Python-only), so a small Python microservice handles only the voice/ML work and the Node backend calls it internally. See `AI_INSTRUCTIONS.md` for why this matters and how to set it up.

## Project structure

```
voice-attendance/
├── README.md
├── PROJECT_SPEC.md
├── DATABASE_SCHEMA.md
├── VOICE_AUTHENTICATION.md
├── AI_ASSISTANT.md
├── UI_REQUIREMENTS.md
├── TODO.md
├── AI_INSTRUCTIONS.md
│
├── frontend/       # React/Next.js app
├── backend/        # Node.js API (auth, students, attendance, Supabase)
├── voice-service/  # Python FastAPI microservice (Whisper + SpeechBrain)
└── docs/           # diagrams, report assets
```

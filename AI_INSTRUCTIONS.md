# Instructions for the AI Coding Assistant

Read this file before writing any code. It exists to prevent the two most common failure modes when an AI agent builds this kind of project: (1) trying to force everything into one language/runtime, and (2) faking the hard part (voice verification) with something that looks like it works but isn't actually checking voice identity.

## 1. Architecture is non-negotiable on one point

Speaker verification libraries (SpeechBrain, Pyannote, Resemblyzer) and Whisper are **Python-only**. Do not attempt to reimplement them in Node.js, do not use a JS "soundalike" library as a substitute, and do not skip real speaker verification and fall back to matching on transcribed text alone — that defeats the entire point of the project (see `VOICE_AUTHENTICATION.md` for why text-only matching is insecure and explicitly called out as the wrong approach).

Required architecture:
```
Frontend (React/Next.js) → Node.js backend → Python FastAPI microservice (Whisper + SpeechBrain/Pyannote) → back to Node → Supabase
```
The Python microservice should expose simple internal HTTP endpoints, e.g.:
- `POST /transcribe` — audio in, text out
- `POST /embed` — audio in, embedding vector out
- `POST /verify` — audio + list of candidate embeddings in, best match + cosine similarity score out

The Node backend calls these internally (not exposed to the frontend directly) and handles auth, database writes, and business logic.

## 2. Build in the order defined in TODO.md

Do not attempt to scaffold the entire application in one pass. Work through `TODO.md` phase by phase, and confirm each milestone actually runs before moving to the next (e.g., don't build the frontend enrollment UI before the embedding/averaging logic is confirmed working via a direct script test).

## 3. Follow the other docs exactly for behavior, not just structure

- `DATABASE_SCHEMA.md` — exact tables/columns to create in Supabase
- `VOICE_AUTHENTICATION.md` — exact enrollment sample count (5), the averaging-into-centroid approach, and the cosine similarity threshold logic
- `AI_ASSISTANT.md` — exact intent categories and sample dialogues; use simple keyword-based intent detection unless told otherwise, don't over-engineer with a trained classifier
- `UI_REQUIREMENTS.md` — exact pages and layout expectations, including the hidden `/admin` route

## 4. Things to explicitly avoid
- Do not store raw voice recordings in the main database — only embeddings (see note in `DATABASE_SCHEMA.md`)
- Do not expose the Python microservice directly to the frontend — always route through the Node backend
- Do not implement anti-spoofing/liveness detection — this is explicitly out of scope, mention only as future scope in comments/docs if relevant
- Do not use a paid/rate-limited API for anything that can be done locally (e.g. prefer local Whisper over a paid STT API, prefer browser SpeechSynthesis over a paid TTS API) — this is a student project and needs to run reliably during a live demo without API key/quota issues

## 5. When in doubt
If a requirement is ambiguous, prefer the simpler implementation that is easy to explain in a viva over a more "impressive" but harder-to-explain one. The student needs to be able to defend every part of this system verbally.

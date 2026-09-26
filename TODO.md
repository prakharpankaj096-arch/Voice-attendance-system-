# TODO — Phased Build Checklist

## Week 1 — Foundation
- [ ] Set up repo structure (frontend / backend / voice-service / docs)
- [ ] Set up Supabase project, create `students` and `attendance` tables per `DATABASE_SCHEMA.md`
- [ ] Set up Python voice-service with FastAPI skeleton
- [ ] Get Whisper working standalone: record audio → print transcribed text
- [ ] Set up Node.js backend skeleton with basic routes (health check, connects to Supabase)
- [ ] Set up frontend skeleton (Next.js), basic routing for pages in `UI_REQUIREMENTS.md`

## Week 2 — Voice Core
- [ ] Implement enrollment: record 5 samples → generate embeddings → average into centroid → save to `students.voice_embedding`
- [ ] Build Voice Enrollment page (frontend) — record, playback, confirm, next phrase
- [ ] Implement verification: new audio → embedding → cosine similarity vs all students → best match + score
- [ ] Test enrollment + verification manually with 2-3 people before wiring anything else

## Week 3 — Attendance + Assistant + Backend
- [ ] Build `/enroll` and `/verify-attendance` endpoints (Node → Python microservice → Supabase)
- [ ] Implement intent detection (mark_attendance / check_attendance / search_student) per `AI_ASSISTANT.md`
- [ ] Build `check_attendance` and `search_student` handlers (simple DB queries + template responses)
- [ ] Build Mark Attendance page with full confirm-before-save flow
- [ ] Build Dashboard page with live stats
- [ ] Build Search Student page

## Week 3-4 — Admin + Integration
- [ ] Build Admin Panel (Add/Edit/Remove student, Reset Voice Data)
- [ ] Wire TTS responses (browser SpeechSynthesis API) so the assistant speaks back
- [ ] Full end-to-end test: enroll → mark attendance → check % → search — all working together

## Week 4 — Testing (don't skip — 15 marks)
- [ ] Enroll 10+ real test users (include a few similar-sounding voice pairs)
- [ ] Measure False Accept Rate / False Reject Rate at multiple thresholds, pick best threshold
- [ ] Measure Whisper transcription accuracy (quiet vs noisy room)
- [ ] Measure end-to-end latency (speak → attendance confirmed)
- [ ] Collect basic usability feedback from 10+ classmates

## Final days — Report & Demo
- [ ] Write report using structure: Abstract → Intro/Problem → Lit Review → Methodology → Implementation → Results → Innovation → Conclusion → References
- [ ] Prepare live demo script: enroll a new voice live → mark attendance → ask a question
- [ ] Record a backup demo video in case live mic fails
- [ ] Prep answers for likely viva questions (similar voices, why Whisper, spoofing/future scope, why a Python microservice)

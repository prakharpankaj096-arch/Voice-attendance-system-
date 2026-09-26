# Voice Authentication

## Why not just speech-to-text

Speech-to-text alone converts spoken words into text. It cannot tell *who* said the words — only *what* was said. If Student A says "Prakhar Pankaj Present," anyone else saying the identical sentence produces identical text. This system therefore treats voice-to-text and speaker verification as **two separate steps**, and attendance is only marked when **both** the words make sense AND the voiceprint matches the enrolled student.

```
Voice
  ↓
Speech-to-Text  (what was said — Whisper)
  ↓
Speaker Recognition  (who said it — SpeechBrain/Pyannote)
  ↓
Voice Feature Extraction (embedding vector)
  ↓
Database Match (cosine similarity vs enrolled voiceprints)
  ↓
Authentication decision (match / no match, with a confidence score)
```

## Enrollment: 5 voice samples

Each student records 5 short phrases during signup:

1. "My name is [Full Name]"
2. "[Full Name] Present"
3. "Voice Attendance Registration"
4. "Computer Science Department"
5. "Attendance System"

Students should be instructed to speak naturally, at a normal pace and volume — not overly slow or robotic — since that's closer to how they'll speak during real attendance marking. Combined, the 5 samples should total roughly 15–25 seconds of audio, which is enough for a reliable embedding.

### Why 5 samples work well
The speaker verification models used here (SpeechBrain ECAPA-TDNN, Pyannote) are **text-independent** — they extract acoustic characteristics of the voice itself (pitch, timbre, resonance), not the specific words spoken. So sample content matters less than total audio duration and variety of natural speech patterns. The 5-phrase set above is good because it gives enough total duration while keeping enrollment quick for the student.

### Building the voiceprint
1. Generate an embedding vector for each of the 5 samples individually.
2. **Average the 5 embeddings into a single centroid vector** — this is the student's stored voiceprint (`voice_embedding` in the database).
3. Averaging (rather than storing and checking against 5 separate vectors) is simpler, faster to match against at attendance time, and is standard practice for this kind of enrollment.

## Verification: matching at attendance time

1. Student speaks their attendance phrase.
2. System generates an embedding from that single utterance.
3. Compute **cosine similarity** between this embedding and every enrolled student's centroid embedding.
4. Take the highest-scoring match.
5. If similarity score ≥ threshold (start at **0.75**, tune based on testing — see below) → match confirmed, proceed to attendance confirmation.
6. If below threshold → reject, ask student to try again or flag for admin review.

## Threshold tuning (do this during testing week, not before)

Test with a real set of enrolled students (aim for 10+, including some who sound similar) and measure:
- **False Accept Rate (FAR)**: wrong person verified as someone else — most important to minimize, this is what prevents proxy attendance
- **False Reject Rate (FRR)**: correct person rejected — annoying but not a security risk

Plot FAR vs FRR at a few threshold values (e.g. 0.65, 0.70, 0.75, 0.80, 0.85) and pick the point that minimizes FAR without making FRR unusably high. Include this chart in your report's Results & Testing section — it directly covers the "Testing methodology, accuracy/performance" rubric criteria.

## What this system does NOT protect against (mention as future scope)
- A recording of the real student's voice being played back (replay/spoofing attack) — mitigated in production systems with liveness detection, out of scope here.

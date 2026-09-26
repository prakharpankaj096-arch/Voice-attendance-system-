"""
Voice Service — FastAPI Microservice
=====================================
Handles all voice/ML work that cannot run in Node.js:
- OpenAI Whisper for Speech-to-Text
- SpeechBrain ECAPA-TDNN for 192-dim Speaker Verification & Voiceprint Enrollment

Endpoints (called by Node.js backend):
  POST /transcribe  — audio file in → transcribed text out (Whisper)
  POST /embed       — audio file in → 192-dim embedding out (SpeechBrain)
  POST /enroll      — 5 audio files in → centroid voiceprint out (SpeechBrain)
  POST /verify      — audio file + candidate embeddings in → STT + best match + similarity score

Health:
  GET  /health      — confirms service is running and models are loaded
"""

import os
import json
import tempfile
import asyncio
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import soundfile as sf
import whisper

from app.speaker import (
    get_speaker_model,
    extract_embedding,
    enroll_voice,
    compute_similarity,
)
from app.audio_utils import convert_to_wav_16k
from app.audio_quality import analyze_audio_quality

app = FastAPI(
    title="Voice Attendance — Voice Service",
    description="Python microservice for Whisper STT and SpeechBrain speaker verification",
    version="1.1.0",
)

# CORS — allow calls from Node backend and local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

whisper_model = None

INITIAL_PROMPT = (
    "This is a student attendance system. Students say their full name "
    "followed by the word Present. Example names: Prakhar Pankaj, Prakhar."
)


@app.on_event("startup")
async def load_models():
    global whisper_model
    print("Loading Whisper model (small)...")
    whisper_model = await asyncio.to_thread(whisper.load_model, "small")
    print("Whisper model loaded successfully.")

    print("Pre-loading SpeechBrain ECAPA-TDNN model...")
    await asyncio.to_thread(get_speaker_model)
    print("SpeechBrain speaker model loaded successfully.")


# ── Health check ─────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "voice-service",
        "whisper_loaded": whisper_model is not None,
        "speaker_loaded": get_speaker_model() is not None,
    }


# ── POST /transcribe ─────────────────────────────────────────────────
@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    """Receives an audio file and returns transcribed text using Whisper."""
    if whisper_model is None:
        raise HTTPException(status_code=503, detail="Whisper model not loaded yet")

    suffix = os.path.splitext(audio.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as raw_tmp:
        contents = await audio.read()
        raw_tmp.write(contents)
        raw_path = raw_tmp.name

    wav_path = None
    try:
        wav_path = convert_to_wav_16k(raw_path)
        result = whisper_model.transcribe(wav_path, language="en", initial_prompt=INITIAL_PROMPT)
        return {"status": "ok", "text": result["text"].strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        for p in [raw_path, wav_path]:
            if p and os.path.exists(p):
                try:
                    os.unlink(p)
                except OSError:
                    pass


# ── POST /embed ──────────────────────────────────────────────────────
@app.post("/embed")
async def embed(audio: UploadFile = File(...)):
    """Receives an audio file and returns a 192-dim speaker embedding vector."""
    suffix = os.path.splitext(audio.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as raw_tmp:
        contents = await audio.read()
        raw_tmp.write(contents)
        raw_path = raw_tmp.name

    wav_path = None
    try:
        wav_path = convert_to_wav_16k(raw_path)
        emb = extract_embedding(wav_path)
        return {
            "status": "ok",
            "embedding": [float(x) for x in emb],
            "dimension": len(emb),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding extraction failed: {str(e)}")
    finally:
        for p in [raw_path, wav_path]:
            if p and os.path.exists(p):
                try:
                    os.unlink(p)
                except OSError:
                    pass


# ── POST /enroll ─────────────────────────────────────────────────────
@app.post("/enroll")
async def enroll(
    student_id: str = Form(...),
    files: List[UploadFile] = File(...),
):
    """
    Receives 5 audio samples for a student, converts each to 16kHz WAV,
    extracts embeddings, checks quality, and averages into a centroid voiceprint.
    """
    if len(files) == 0:
        raise HTTPException(status_code=400, detail="At least 1 audio file is required")

    temp_raw_files = []
    temp_wav_files = []

    try:
        for f in files:
            suffix = os.path.splitext(f.filename or "sample.webm")[1] or ".webm"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                content = await f.read()
                tmp.write(content)
                temp_raw_files.append(tmp.name)

            wav_path = convert_to_wav_16k(tmp.name)
            temp_wav_files.append(wav_path)

        # Run enrollment core
        enroll_result = enroll_voice(student_id, temp_wav_files)
        return {
            "status": "ok",
            **enroll_result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Voice enrollment failed: {str(e)}")
    finally:
        for p in temp_raw_files + temp_wav_files:
            if p and os.path.exists(p):
                try:
                    os.unlink(p)
                except OSError:
                    pass


# ── POST /verify ─────────────────────────────────────────────────────
@app.post("/verify")
async def verify(
    audio: UploadFile = File(...),
    candidates: str = Form(...),  # JSON string: [{"id": "...", "name": "...", "roll_number": "...", "voice_embedding": [...]}]
):
    """
    Receives 1 audio file + candidate embeddings.
    Performs:
    1. Whisper speech-to-text
    2. SpeechBrain speaker verification against all candidates
    3. Audio quality analysis
    Returns best matching candidate and similarity score.
    """
    try:
        candidate_list = json.loads(candidates)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid candidates JSON: {str(e)}")

    suffix = os.path.splitext(audio.filename or "verify.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as raw_tmp:
        contents = await audio.read()
        raw_tmp.write(contents)
        raw_path = raw_tmp.name

    wav_path = None
    try:
        wav_path = convert_to_wav_16k(raw_path)

        # 1. Whisper STT
        stt_result = whisper_model.transcribe(wav_path, language="en", initial_prompt=INITIAL_PROMPT)
        transcription = stt_result["text"].strip()

        # 2. Extract verification embedding
        test_emb = extract_embedding(wav_path)

        # 3. Audio quality analysis
        data, sr = sf.read(wav_path, dtype="float32")
        quality = analyze_audio_quality(data, sr)

        # 4. Compare against candidates
        all_scores = []
        best_match = None
        best_score = -1.0

        for cand in candidate_list:
            cand_emb = cand.get("voice_embedding")
            if not cand_emb:
                continue

            score = compute_similarity(test_emb, cand_emb)
            score_entry = {
                "id": cand.get("id"),
                "name": cand.get("name"),
                "roll_number": cand.get("roll_number"),
                "score": round(score, 4),
            }
            all_scores.append(score_entry)

            if score > best_score:
                best_score = score
                best_match = {
                    "id": cand.get("id"),
                    "name": cand.get("name"),
                    "roll_number": cand.get("roll_number"),
                }

        all_scores.sort(key=lambda x: x["score"], reverse=True)

        return {
            "status": "ok",
            "transcription": transcription,
            "best_match": best_match,
            "score": round(best_score, 4) if best_score >= 0 else 0.0,
            "all_scores": all_scores,
            "quality": quality,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")
    finally:
        for p in [raw_path, wav_path]:
            if p and os.path.exists(p):
                try:
                    os.unlink(p)
                except OSError:
                    pass

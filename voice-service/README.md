# Voice Service — Python FastAPI Microservice
#
# This microservice handles the voice/ML work that cannot run in Node.js:
#   - POST /transcribe  — audio in, text out (Whisper)
#   - POST /embed        — audio in, embedding vector out (SpeechBrain/Pyannote)
#   - POST /verify       — audio + candidate embeddings in, best match + cosine similarity out
#
# The Node.js backend calls these endpoints internally.
# This service is NOT exposed directly to the frontend.

# Requirements (will be installed in a later step):
#   fastapi
#   uvicorn
#   openai-whisper
#   speechbrain
#   torchaudio
#   numpy
#   scipy

# To install (after Python env setup):
#   pip install -r requirements.txt

# To run (after setup):
#   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

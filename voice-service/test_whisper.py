"""
Standalone Whisper Test Script
==============================
Records 5 seconds of audio from your microphone, saves it as a WAV file,
and transcribes it using Whisper (running locally, no API key needed).

This is TODO.md Week 1, Item 4: "Get Whisper working standalone."

Usage:
    cd voice-service
    venv\\Scripts\\activate
    python test_whisper.py

What happens:
    1. You'll see "Recording... speak now!" — say a phrase clearly
    2. After 5 seconds, recording stops automatically
    3. Audio is saved to test_recording.wav (you can play it back to verify)
    4. Whisper transcribes it and prints the result

Try saying one of the enrollment phrases from VOICE_AUTHENTICATION.md:
    - "My name is Prakhar Pankaj"
    - "Prakhar Pankaj Present"
    - "Voice Attendance Registration"
"""

import sounddevice as sd
import numpy as np
import scipy.io.wavfile as wav
import whisper
import sys
import time

# ── Config ───────────────────────────────────────────────────────────
DURATION = 5          # seconds to record
SAMPLE_RATE = 16000   # 16kHz — what Whisper expects
OUTPUT_FILE = "test_recording.wav"
WHISPER_MODEL = "small" # tiny | base | small | medium | large
INITIAL_PROMPT = (
    "This is a student attendance system. Students say their full name "
    "followed by the word Present. Example names: Prakhar Pankaj, Prakhar."
)

def main():
    # Step 1: Countdown then record audio from microphone
    print(f"\nGet ready to speak...")
    for i in [3, 2, 1]:
        print(f"  {i}...", flush=True)
        time.sleep(1)
    print(f"Recording for {DURATION} seconds... speak now!\n")
    try:
        audio = sd.rec(
            int(DURATION * SAMPLE_RATE),
            samplerate=SAMPLE_RATE,
            channels=1,       # mono
            dtype="float32",
        )
        sd.wait()  # block until recording is done
    except Exception as e:
        print(f"Error: Could not record from microphone: {e}")
        print("Make sure your mic is connected and not in use by another app.")
        sys.exit(1)

    print("Recording complete.")

    # Step 2: Save to WAV file
    # Convert float32 [-1, 1] to int16 for WAV file
    audio_int16 = np.int16(audio * 32767)
    wav.write(OUTPUT_FILE, SAMPLE_RATE, audio_int16)
    print(f"Audio saved to: {OUTPUT_FILE}")

    # Step 3: Transcribe with Whisper
    print(f"\nLoading Whisper model ({WHISPER_MODEL})... ", end="", flush=True)
    model = whisper.load_model(WHISPER_MODEL)
    print("done.")

    print("Transcribing... ", end="", flush=True)
    result = model.transcribe(OUTPUT_FILE, language="en", initial_prompt=INITIAL_PROMPT)
    text = result["text"].strip()
    print("done.\n")

    # Step 4: Show result
    print("=" * 50)
    print(f"  Transcribed text: \"{text}\"")
    print("=" * 50)

    if not text:
        print("\n(Empty result — Whisper didn't detect speech.")
        print(" Try speaking louder or closer to the mic.)")

if __name__ == "__main__":
    main()

"""
Standalone Voiceprint Enrollment & Verification Test Script
===========================================================
Records 5 enrollment voice samples from your microphone, generates
SpeechBrain ECAPA-TDNN 192-dim embeddings for each, calculates their
centroid voiceprint, and tests live verification against the voiceprint.

This is TODO.md Week 2, Item 1 & 4:
"Implement enrollment: record 5 samples -> generate embeddings -> average into centroid"
"Test enrollment + verification manually before wiring anything else"

Usage:
    cd voice-service
    venv\\Scripts\\activate
    python test_voiceprint.py

Flow:
    1. Prompts you to speak the 5 standard phrases from VOICE_AUTHENTICATION.md
    2. Records each sample with a 3-2-1 countdown
    3. Computes individual embeddings & cross-sample consistency matrix
    4. Computes the averaged centroid voiceprint vector
    5. Prompts you for a 6th "verification" utterance
    6. Calculates cosine similarity vs centroid (Threshold: 0.75) and reports MATCH/REJECT
"""

import os
import sys
import time
import numpy as np
import scipy.io.wavfile as wav
import sounddevice as sd

# Add project root to sys.path so app modules import cleanly
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.speaker import extract_embedding, enroll_voice, compute_similarity, get_speaker_model
from app.audio_quality import analyze_audio_quality

# ── Config ───────────────────────────────────────────────────────────
DURATION = 4          # seconds per sample
SAMPLE_RATE = 16000   # 16kHz required by SpeechBrain & Whisper
THRESHOLD = 0.75      # Verification threshold per VOICE_AUTHENTICATION.md
SAMPLES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "enrollment_samples")

ENROLLMENT_PHRASES = [
    "My name is Prakhar Pankaj",
    "Prakhar Pankaj Present",
    "Voice Attendance Registration",
    "Computer Science Department",
    "Attendance System",
]


def record_sample(phrase_index: int, phrase_text: str, output_path: str):
    """
    Prompts user, counts down, records audio, checks audio quality (SNR & energy),
    and allows re-recording if the audio is too noisy, too quiet, or clipped.
    """
    attempt = 1
    while True:
        print("\n" + "─" * 60)
        attempt_str = f" (Attempt {attempt})" if attempt > 1 else ""
        print(f"Sample {phrase_index + 1}/5{attempt_str}:")
        print(f"  Phrase: \"{phrase_text}\"")
        print("─" * 60)
        input("Press ENTER when you are ready to speak...")

        print("Get ready...")
        for c in [3, 2, 1]:
            print(f"  {c}...", flush=True)
            time.sleep(1)
        print(f"Recording for {DURATION} seconds... SPEAK NOW!\n", flush=True)

        try:
            audio = sd.rec(
                int(DURATION * SAMPLE_RATE),
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="float32",
            )
            sd.wait()
        except Exception as e:
            print(f"Recording error: {e}")
            sys.exit(1)

        print("Recording complete.")

        # Audio Quality Check
        audio_flat = audio.flatten()
        quality = analyze_audio_quality(audio_flat, sample_rate=SAMPLE_RATE)

        print(f"\n[Audio Quality Analysis]")
        print(f"  - Speech Energy (RMS): {quality['speech_rms']:.4f}")
        print(f"  - Background Noise:    {quality['noise_rms']:.4f}")
        print(f"  - Estimated SNR:       {quality['snr_db']:.1f} dB")
        print(f"  - Peak Amplitude:      {quality['peak']:.2f}")

        if not quality["is_acceptable"]:
            print(f"\n⚠️  QUALITY WARNING: {quality['warning_message']}")
            choice = input("--> Recommended to re-record. Re-record now? (Y/n): ").strip().lower()
            if choice != "n":
                attempt += 1
                continue
        elif quality.get("warning_message"):
            print(f"\nℹ️  Notice: {quality['warning_message']}")
            choice = input("--> Accept sample or re-record? ([ENTER] to accept / 'r' to re-record): ").strip().lower()
            if choice == "r":
                attempt += 1
                continue
        else:
            print(f"  ✅ Quality Status: EXCELLENT (Clean speech, low noise)")
            choice = input("--> Press [ENTER] to continue, or type 'r' to re-record: ").strip().lower()
            if choice == "r":
                attempt += 1
                continue

        # Save to WAV file
        audio_int16 = np.int16(np.clip(audio, -1.0, 1.0) * 32767)
        wav.write(output_path, SAMPLE_RATE, audio_int16)
        print(f"Saved to: {os.path.basename(output_path)}")
        break


def main():
    print("=" * 60)
    print("  WEEK 2: VOICEPRINT ENROLLMENT & VERIFICATION TEST")
    print("=" * 60)
    print("Pre-loading SpeechBrain ECAPA-TDNN model... ", end="", flush=True)
    get_speaker_model()
    print("Ready!\n")

    os.makedirs(SAMPLES_DIR, exist_ok=True)
    audio_paths = []

    # Step 1: Record 5 enrollment samples
    print("We will record 5 short phrases to build your centroid voiceprint.")
    print("Speak naturally at normal volume and pace.")

    for i, phrase in enumerate(ENROLLMENT_PHRASES):
        out_file = os.path.join(SAMPLES_DIR, f"enroll_sample_{i + 1}.wav")
        record_sample(i, phrase, out_file)
        audio_paths.append(out_file)

    # Step 2: Run enroll_voice() to build the centroid
    print("\n" + "=" * 60)
    print("Extracting embeddings and generating centroid voiceprint...")
    print("=" * 60)

    result = enroll_voice("student_prakhar", audio_paths)
    centroid = result["embedding"]

    print(f"\n[OK] Processed {result['sample_count']} samples successfully.")
    print(f"[OK] Embedding dimension: {result['dimension']} (ECAPA-TDNN standard)")
    print(f"[OK] Voiceprint centroid created (first 5 values: {[round(v, 4) for v in centroid[:5]]}...)")
    print(f"[OK] Average internal sample consistency: {result['avg_internal_similarity']:.4f}")

    if "quality_reports" in result:
        print("\nAudio Quality Summary per sample:")
        for q in result["quality_reports"]:
            status_symbol = "✅" if q["is_acceptable"] else "⚠️"
            print(f"  {status_symbol} {q['file']:20}: SNR={q['snr_db']:4.1f} dB, Speech RMS={q['speech_rms']:.4f} ({q['status']})")

    print("\nPairwise similarity matrix between your 5 samples:")
    idx = 0
    for i in range(5):
        for j in range(i + 1, 5):
            score = result["pairwise_similarities"][idx]
            print(f"  Sample {i + 1} vs Sample {j + 1}: {score:.4f}")
            idx += 1

    if result["avg_internal_similarity"] >= 0.70:
        print("\n--> Voice consistency is high (samples clearly belong to the same speaker).")
    else:
        print("\n--> Note: Internal consistency is lower than usual. Try speaking in a quieter environment.")

    # Step 3: Verification Test
    print("\n" + "=" * 60)
    print("LIVE VERIFICATION TEST")
    print("=" * 60)
    print("Now let's test verifying a live utterance against your centroid voiceprint.")
    print("Say an attendance phrase like: \"Prakhar Pankaj Present\"")
    input("Press ENTER to record test verification sample...")

    verify_path = os.path.join(SAMPLES_DIR, "verify_test.wav")
    print("Get ready...")
    for c in [3, 2, 1]:
        print(f"  {c}...", flush=True)
        time.sleep(1)
    print(f"Recording for {DURATION} seconds... SPEAK NOW!\n", flush=True)

    audio = sd.rec(
        int(DURATION * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="float32",
    )
    sd.wait()
    audio_int16 = np.int16(np.clip(audio, -1.0, 1.0) * 32767)
    wav.write(verify_path, SAMPLE_RATE, audio_int16)

    # Check verification sample quality
    v_quality = analyze_audio_quality(audio.flatten(), sample_rate=SAMPLE_RATE)
    print(f"\n[Verification Audio Quality: SNR={v_quality['snr_db']:.1f} dB, Speech RMS={v_quality['speech_rms']:.4f}]")
    if not v_quality["is_acceptable"]:
        print(f"⚠️  Quality Warning: {v_quality['warning_message']}")

    print("Extracting test embedding...")
    test_embedding = extract_embedding(verify_path)
    score = compute_similarity(test_embedding, centroid)

    print("\n" + "─" * 60)
    print(f"VERIFICATION RESULT:")
    print(f"  Similarity Score: {score:.4f}")
    print(f"  Match Threshold:  {THRESHOLD:.2f}")
    if score >= THRESHOLD:
        print(f"  DECISION:         [MATCH CONFIRMED] (Score {score:.4f} >= {THRESHOLD})")
        print(f"  Attendance would be marked PRESENT for Prakhar.")
    else:
        print(f"  DECISION:         [REJECTED] (Score {score:.4f} < {THRESHOLD})")
        print(f"  Voice did not match the enrolled voiceprint sufficiently.")
    print("─" * 60 + "\n")


if __name__ == "__main__":
    main()

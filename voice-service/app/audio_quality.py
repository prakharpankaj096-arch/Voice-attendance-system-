"""
Audio Quality Analysis Module
=============================
Provides lightweight signal-to-noise ratio (SNR) estimation, RMS energy
analysis, and speech vs background noise detection.

Used during voice enrollment to detect:
- Too quiet audio (mic too far, low input gain, no speech detected)
- Too noisy audio (fans, traffic, loud ambient noise)
- Audio clipping (mic input gain too high, distortion)
"""

import numpy as np
from typing import Dict, Any, Tuple, Union


def analyze_audio_quality(
    audio_data: np.ndarray,
    sample_rate: int = 16000,
    frame_ms: int = 25,
) -> Dict[str, Any]:
    """
    Analyzes an audio waveform for quality and signal-to-noise characteristics.

    Args:
        audio_data: 1D NumPy array of float32 samples in [-1.0, 1.0]
        sample_rate: Audio sample rate in Hz (default 16000)
        frame_ms: Analysis frame length in milliseconds (default 25ms)

    Returns:
        Dict with:
        - is_acceptable: bool (True if acceptable for enrollment)
        - status: "good" | "too_quiet" | "too_noisy" | "clipped"
        - warning_message: str or None
        - snr_db: float (estimated signal-to-noise ratio in decibels)
        - speech_rms: float (RMS energy of speech portions)
        - noise_rms: float (RMS energy of background silence portions)
        - peak: float (peak absolute amplitude)
        - speech_detected: bool
    """
    # Flatten if multi-channel
    if audio_data.ndim > 1:
        audio_data = np.mean(audio_data, axis=-1 if audio_data.shape[0] > audio_data.shape[-1] else 0)

    audio = np.asarray(audio_data, dtype=np.float32)

    if len(audio) == 0:
        return {
            "is_acceptable": False,
            "status": "too_quiet",
            "warning_message": "Audio sample is completely empty.",
            "snr_db": 0.0,
            "speech_rms": 0.0,
            "noise_rms": 0.0,
            "peak": 0.0,
            "speech_detected": False,
        }

    peak = float(np.max(np.abs(audio)))
    overall_rms = float(np.sqrt(np.mean(audio ** 2)))

    # Frame-level RMS energy calculation
    frame_size = int(sample_rate * (frame_ms / 1000.0))
    if frame_size < 1:
        frame_size = 400

    num_frames = len(audio) // frame_size
    if num_frames < 4:
        # Audio too short for framing
        return {
            "is_acceptable": overall_rms >= 0.01,
            "status": "good" if overall_rms >= 0.01 else "too_quiet",
            "warning_message": None if overall_rms >= 0.01 else "Audio is very quiet.",
            "snr_db": 15.0 if overall_rms >= 0.01 else 0.0,
            "speech_rms": overall_rms,
            "noise_rms": 0.001,
            "peak": peak,
            "speech_detected": overall_rms >= 0.01,
        }

    frames = audio[: num_frames * frame_size].reshape(num_frames, frame_size)
    frame_energies = np.sqrt(np.mean(frames ** 2, axis=1))

    # Sort frame energies to distinguish background noise from active speech
    sorted_energies = np.sort(frame_energies)

    # Lowest 25% represents background noise floor / silence
    noise_count = max(1, int(num_frames * 0.25))
    noise_rms = float(np.mean(sorted_energies[:noise_count]))

    # Top 35% represents active speech frames
    speech_count = max(1, int(num_frames * 0.35))
    speech_rms = float(np.mean(sorted_energies[-speech_count:]))

    # Estimated SNR (avoid division by zero)
    snr_ratio = (speech_rms + 1e-6) / (noise_rms + 1e-6)
    snr_db = float(20.0 * np.log10(snr_ratio))

    # Evaluate quality thresholds
    is_acceptable = True
    status = "good"
    warning = None

    # Check 1: Clipping / Distortion
    if peak >= 0.98:
        is_acceptable = False
        status = "clipped"
        warning = "Audio is clipped/distorted. Move slightly further from the mic or lower mic gain."

    # Check 2: Too Quiet / No Speech Detected
    elif speech_rms < 0.012 or peak < 0.04:
        is_acceptable = False
        status = "too_quiet"
        warning = "Audio is too quiet. Please speak closer to the microphone or speak louder."

    # Check 3: Low SNR / High Background Noise
    elif snr_db < 10.0 and noise_rms > 0.010:
        is_acceptable = False
        status = "too_noisy"
        warning = (
            f"High background noise detected (SNR: {snr_db:.1f} dB). "
            "Please record in a quieter environment or turn off fans/background audio."
        )

    # Marginal warning (acceptable, but suboptimal)
    elif snr_db < 12.0:
        warning = f"Moderate background noise present (SNR: {snr_db:.1f} dB)."

    return {
        "is_acceptable": is_acceptable,
        "status": status,
        "warning_message": warning,
        "snr_db": round(snr_db, 1),
        "speech_rms": round(speech_rms, 4),
        "noise_rms": round(noise_rms, 4),
        "peak": round(peak, 3),
        "speech_detected": speech_rms >= 0.012,
    }

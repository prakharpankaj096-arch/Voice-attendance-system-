"""
Speaker Verification & Voiceprint Enrollment Module
===================================================
Uses SpeechBrain's pretrained ECAPA-TDNN model (spkrec-ecapa-voxceleb)
to generate 192-dimensional speaker embeddings.

Key Functions:
- get_speaker_model(): Cached singleton loader for the ECAPA-TDNN model
- extract_embedding(audio_path): Extracts & L2-normalizes a 192-dim embedding
- compute_similarity(emb1, emb2): Cosine similarity between two embeddings
- enroll_voice(student_id, audio_paths): Processes 5 sample audio files,
  averages their embeddings into a unit-normalized centroid voiceprint
"""

import os
import warnings
from typing import List, Dict, Any, Union
import numpy as np
import soundfile as sf
import torch
import torchaudio.transforms as T
from app.audio_quality import analyze_audio_quality

# Suppress harmless Windows symlink warning from SpeechBrain fetching
warnings.filterwarnings("ignore", category=UserWarning, module="speechbrain")

_speaker_model = None
MODEL_SOURCE = "speechbrain/spkrec-ecapa-voxceleb"
DEFAULT_CACHE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "models",
    "spkrec-ecapa-voxceleb",
)


def get_speaker_model(cache_dir: str = DEFAULT_CACHE_DIR):
    """
    Loads and caches the SpeechBrain ECAPA-TDNN speaker encoder.
    Downloads to cache_dir on first run (~80MB), loads offline thereafter.
    """
    global _speaker_model
    if _speaker_model is not None:
        return _speaker_model

    from speechbrain.inference.classifiers import EncoderClassifier

    device = "cuda" if torch.cuda.is_available() else "cpu"
    os.makedirs(cache_dir, exist_ok=True)

    _speaker_model = EncoderClassifier.from_hparams(
        source=MODEL_SOURCE,
        savedir=cache_dir,
        run_opts={"device": device},
    )
    return _speaker_model


def extract_embedding(
    audio_path: str,
    target_sample_rate: int = 16000,
) -> np.ndarray:
    """
    Extracts a 192-dimensional speaker embedding from an audio file.

    Steps:
    1. Loads audio via torchaudio / soundfile
    2. Resamples to 16kHz and converts to mono if needed
    3. Runs inference through the ECAPA-TDNN encoder
    4. L2-normalizes the resulting vector (norm = 1.0)

    Returns:
        np.ndarray of shape (192,), dtype float32
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    model = get_speaker_model()

    # Load audio via soundfile, falling back to ffmpeg for webm/opus browser recordings
    converted_path = None
    try:
        data, sr = sf.read(audio_path, dtype="float32")
    except Exception:
        from app.audio_utils import convert_to_wav_16k
        converted_path = convert_to_wav_16k(audio_path)
        data, sr = sf.read(converted_path, dtype="float32")

    try:
        waveform = torch.from_numpy(data)

        # Convert to (channels, time)
        if waveform.ndim == 1:
            waveform = waveform.unsqueeze(0)
        elif waveform.ndim == 2:
            waveform = waveform.t()

        # Convert to mono if multi-channel
        if waveform.shape[0] > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)

        # Resample to 16kHz if necessary
        if sr != target_sample_rate:
            resampler = T.Resample(orig_freq=sr, new_freq=target_sample_rate)
            waveform = resampler(waveform)

        # Generate embedding: model.encode_batch expects (batch, time)
        # waveform shape is (1, time)
        with torch.no_grad():
            emb_tensor = model.encode_batch(waveform)
            # Squeeze batch & channel dimensions: (1, 1, 192) -> (192,)
            emb_np = emb_tensor.squeeze().cpu().numpy().astype(np.float32)

        # L2 normalize
        norm = np.linalg.norm(emb_np)
        if norm > 0:
            emb_np = emb_np / norm

        return emb_np
    finally:
        if converted_path and os.path.exists(converted_path):
            try:
                os.unlink(converted_path)
            except OSError:
                pass


def compute_similarity(
    emb1: Union[np.ndarray, List[float]],
    emb2: Union[np.ndarray, List[float]],
) -> float:
    """
    Computes cosine similarity between two 192-dimensional embeddings.
    Since both embeddings are L2-normalized, cosine similarity equals
    their dot product, bounded in [-1.0, 1.0].
    """
    a = np.asarray(emb1, dtype=np.float32)
    b = np.asarray(emb2, dtype=np.float32)

    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)

    if norm_a == 0 or norm_b == 0:
        return 0.0

    similarity = float(np.dot(a, b) / (norm_a * norm_b))
    return max(-1.0, min(1.0, similarity))


def enroll_voice(
    student_id: str,
    audio_paths: List[str],
) -> Dict[str, Any]:
    """
    Enrolls a student's voiceprint from multiple audio samples (standard: 5).

    Steps:
    1. Extract 192-dim embedding from each sample
    2. Compute pairwise similarity matrix as a voice consistency check
    3. Average the individual embeddings to produce a single centroid vector
    4. Re-normalize centroid to unit length (L2 norm = 1.0)

    Args:
        student_id: Identifier (UUID or string) for the student
        audio_paths: List of file paths to the enrollment audio WAV files

    Returns:
        Dict containing:
        - student_id: str
        - embedding: List[float] (192 values, ready for Supabase float8[]/jsonb)
        - dimension: int (192)
        - sample_count: int
        - pairwise_similarities: List[float] (consistency metric across samples)
        - avg_internal_similarity: float (mean pairwise similarity)
    """
    if not audio_paths:
        raise ValueError("At least one audio path is required for enrollment")

    individual_embeddings = []
    quality_reports = []
    for path in audio_paths:
        data, sr = sf.read(path, dtype="float32")
        q = analyze_audio_quality(data, sr)
        quality_reports.append({
            "file": os.path.basename(path),
            "is_acceptable": q["is_acceptable"],
            "status": q["status"],
            "snr_db": q["snr_db"],
            "speech_rms": q["speech_rms"],
            "warning": q["warning_message"],
        })
        emb = extract_embedding(path)
        individual_embeddings.append(emb)

    # Compute pairwise similarities to check consistency
    pairwise = []
    n = len(individual_embeddings)
    for i in range(n):
        for j in range(i + 1, n):
            sim = compute_similarity(individual_embeddings[i], individual_embeddings[j])
            pairwise.append(round(sim, 4))

    avg_internal = float(np.mean(pairwise)) if pairwise else 1.0

    # Calculate centroid vector (arithmetic mean)
    centroid = np.mean(individual_embeddings, axis=0)

    # Re-normalize centroid to unit length
    c_norm = np.linalg.norm(centroid)
    if c_norm > 0:
        centroid = centroid / c_norm

    return {
        "student_id": student_id,
        "embedding": [float(x) for x in centroid],
        "dimension": len(centroid),
        "sample_count": len(audio_paths),
        "pairwise_similarities": pairwise,
        "avg_internal_similarity": round(avg_internal, 4),
        "quality_reports": quality_reports,
    }

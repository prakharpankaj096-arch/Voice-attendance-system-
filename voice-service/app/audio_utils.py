"""
Audio Utility Functions
=======================
Uses system ffmpeg to normalize any audio format (WebM, OGG, MP4, WAV)
from browser MediaRecorder or files into a standard 16kHz mono 16-bit PCM WAV.
"""

import os
import subprocess
import tempfile


def convert_to_wav_16k(input_path: str, output_path: str = None) -> str:
    """
    Converts any incoming audio file to 16kHz mono 16-bit PCM WAV using ffmpeg.
    If output_path is not specified, creates a temporary .wav file.
    """
    if output_path is None:
        fd, output_path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)

    cmd = [
        "ffmpeg",
        "-y",               # overwrite without asking
        "-v", "error",       # only show errors
        "-i", input_path,
        "-ar", "16000",      # 16kHz sampling rate
        "-ac", "1",          # mono channel
        "-c:a", "pcm_s16le", # 16-bit PCM
        output_path,
    ]

    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as e:
        if os.path.exists(output_path):
            try:
                os.unlink(output_path)
            except OSError:
                pass
        raise RuntimeError(f"FFmpeg audio conversion failed: {e.stderr.decode('utf-8', errors='ignore')}")

    return output_path

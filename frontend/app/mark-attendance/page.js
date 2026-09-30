"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
  Mic,
  Square,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Volume2,
  CheckCircle2,
  UserCheck,
  VolumeX,
} from "lucide-react";
import { formatSuccessfulAttendance, formatAlreadyMarked } from "../../lib/responseFormatter";
import ttsEngine from "../../lib/ttsEngine";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

export default function MarkAttendancePage() {
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(4);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [ttsEnabled, setTtsEnabled] = useState(true);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const handleToggleTts = () => {
    const nextState = !ttsEnabled;
    setTtsEnabled(nextState);
    if (!nextState) {
      try {
        ttsEngine.cancel();
      } catch (_) {}
    }
  };

const COUNTDOWN_STEP_MS = process.env.NODE_ENV === "test" ? 10 : 800;
const RECORD_TIMER_INTERVAL_MS = process.env.NODE_ENV === "test" ? 25 : 1000;

  // ── Recording Flow ──────────────────────────────────────────────────
  const startRecording = async () => {
    setError(null);
    setResult(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // 3-2-1 Countdown
      setCountdown(3);
      const countInterval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countInterval);
            beginCapture(stream);
            return null;
          }
          return prev - 1;
        });
      }, COUNTDOWN_STEP_MS);
    } catch (err) {
      setError("Microphone access denied. Please allow mic permissions in your browser.");
    }
  };

  const beginCapture = (stream) => {
    setIsRecording(true);
    setSecondsLeft(4);

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined,
    });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const audioBlob = new Blob(audioChunksRef.current, {
        type: mediaRecorder.mimeType || "audio/webm",
      });
      setIsRecording(false);
      await sendAudioForVerification(audioBlob);
    };

    mediaRecorder.start();

    // 4-second timer
    let remaining = 4;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }
    }, RECORD_TIMER_INTERVAL_MS);
  };

  const stopEarly = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  // ── Backend Submission & TTS Integration ────────────────────────────
  const sendAudioForVerification = async (blob) => {
    setProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("audio", blob, "attendance.webm");

      const res = await fetch(`${BACKEND_URL}/attendance/mark`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to process attendance");
      }

      // Format message according to scenario using responseFormatter
      const studentName =
        data.student?.name || (typeof data.student === "string" ? data.student : "");
      let formattedMsg = data.message;

      if (data.matched && studentName) {
        if (data.already_marked) {
          formattedMsg = formatAlreadyMarked(studentName);
        } else {
          formattedMsg = formatSuccessfulAttendance(studentName);
        }
      }

      setResult({
        ...data,
        message: formattedMsg || data.message,
      });

      // Trigger Assistant TTS speech using centralized ttsEngine
      if (ttsEnabled && formattedMsg) {
        try {
          ttsEngine.speak(formattedMsg);
        } catch (ttsErr) {
          // TTS failure does not break attendance marking or result display
          console.warn("TTS playback failed:", ttsErr);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto text-center mt-4 pb-12">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Mark Attendance</h1>
      <p className="text-slate-500 text-sm mb-6">
        Press the microphone and say your name followed by &ldquo;Present&rdquo;
      </p>

      {/* ── TTS Voice Output Toggle ─────────────────────────────────── */}
      <div className="flex justify-center mb-6">
        <button
          type="button"
          onClick={handleToggleTts}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
            ttsEnabled
              ? "bg-indigo-50 border-indigo-200 text-indigo-700"
              : "bg-slate-100 border-slate-200 text-slate-500"
          }`}
        >
          {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          Assistant Voice Feedback: {ttsEnabled ? "ON" : "OFF"}
        </button>
      </div>

      {/* ── Error Banner ────────────────────────────────────────────── */}
      {error && (
        <div
          className="mb-6 flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl p-4 text-left"
          role="alert"
        >
          <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="text-sm text-rose-700">
            <p className="font-semibold">Attendance Notice</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ── Microphone Card ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm relative overflow-hidden">
        {/* Countdown */}
        {countdown !== null && (
          <div className="py-8">
            <div className="text-6xl font-black text-indigo-600 animate-pulse">
              {countdown}
            </div>
            <p className="text-sm font-semibold text-slate-600 mt-3">
              Get ready to speak clearly...
            </p>
          </div>
        )}

        {/* Recording active */}
        {isRecording && (
          <div className="py-6 space-y-4">
            <div className="relative inline-flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-32 w-32 rounded-full bg-rose-400 opacity-75"></span>
              <button
                onClick={stopEarly}
                className="relative w-28 h-28 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-xl hover:bg-rose-700 transition-all"
                aria-label="Stop recording"
              >
                <Mic className="w-12 h-12 animate-pulse" />
              </button>
            </div>
            <p className="text-sm font-bold text-rose-600">
              Listening... ({secondsLeft}s remaining)
            </p>
            <p className="text-xs text-slate-400">
              Say: &ldquo;[Your Name] Present&rdquo;
            </p>
            <button
              onClick={stopEarly}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors"
            >
              <Square className="w-3.5 h-3.5" /> Stop Now
            </button>
          </div>
        )}

        {/* Processing State */}
        {processing && (
          <div className="py-10 space-y-3">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-800">
              Verifying voiceprint & transcribing...
            </p>
            <p className="text-xs text-slate-400">
              Running Whisper STT + SpeechBrain ECAPA-TDNN verification
            </p>
          </div>
        )}

        {/* Idle State */}
        {!isRecording && countdown === null && !processing && (
          <div className="py-4 space-y-4">
            <button
              onClick={startRecording}
              className="mx-auto w-28 h-28 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all shadow-lg hover:shadow-xl"
              aria-label="Start recording attendance"
            >
              <Mic className="w-12 h-12" />
            </button>
            <p className="text-sm font-semibold text-slate-700">
              {result ? "Tap to record again" : "Tap microphone to start"}
            </p>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Example: &ldquo;Prakhar Pankaj Present&rdquo;
            </p>
          </div>
        )}
      </div>

      {/* ── Results Panel ────────────────────────────────────────────── */}
      <div className="mt-6 space-y-4 text-left">
        {/* Transcript Panel */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-slate-400" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Speech Transcript
            </p>
          </div>
          {result?.transcription ? (
            <p className="text-slate-900 font-medium text-base">
              &ldquo;{result.transcription}&rdquo;
            </p>
          ) : (
            <p className="text-slate-400 italic text-sm">
              Your transcribed speech will appear here...
            </p>
          )}
        </div>

        {/* AI Assistant Dialogue Panel */}
        <div
          className={`rounded-xl border p-5 shadow-sm transition-all ${
            result?.matched && result?.already_marked
              ? "bg-amber-50/70 border-amber-200"
              : result?.matched
              ? "bg-emerald-50/70 border-emerald-200"
              : result
              ? "bg-rose-50/70 border-rose-200"
              : "bg-white border-slate-200"
          }`}
          data-testid="assistant-dialogue-panel"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {result?.matched && !result?.already_marked ? (
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              ) : result?.matched && result?.already_marked ? (
                <CheckCircle2 className="w-4 h-4 text-amber-600" />
              ) : result ? (
                <ShieldAlert className="w-4 h-4 text-rose-600" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-slate-400" />
              )}
              <p
                className={`text-xs font-bold uppercase tracking-wide ${
                  result?.matched && !result?.already_marked
                    ? "text-emerald-700"
                    : result?.matched && result?.already_marked
                    ? "text-amber-700"
                    : result
                    ? "text-rose-700"
                    : "text-slate-500"
                }`}
              >
                AI Assistant Response
              </p>
            </div>

            {result && (
              <div className="flex items-center gap-1.5">
                {result.detected_intent && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    {result.detected_intent === "mark_attendance"
                      ? "Attendance Action"
                      : result.detected_intent}
                  </span>
                )}
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                    result.matched && !result.already_marked
                      ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                      : result.matched && result.already_marked
                      ? "bg-amber-100 border-amber-300 text-amber-800"
                      : "bg-rose-100 border-rose-300 text-rose-800"
                  }`}
                  data-testid="attendance-status-badge"
                >
                  {result.matched && !result.already_marked
                    ? "VERIFIED"
                    : result.matched && result.already_marked
                    ? "ALREADY MARKED"
                    : "NOT VERIFIED"}
                </span>
              </div>
            )}
          </div>

          {result?.message ? (
            <p
              className="text-slate-900 text-sm font-medium leading-relaxed"
              data-testid="assistant-message"
            >
              {result.message}
            </p>
          ) : (
            <p className="text-slate-400 italic text-sm">
              Waiting for voice input...
            </p>
          )}

          {/* Special already-marked notification panel */}
          {result?.matched && result?.already_marked && (
            <div
              className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-900"
              data-testid="already-marked-panel"
            >
              <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-medium">
                {result.message}
              </span>
            </div>
          )}

          {/* Student detail badge if verified */}
          {result?.matched && result?.student && (
            <div className="mt-4 pt-3 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-slate-900">
                  {result.student.name}
                </span>
                <span className="text-slate-500">
                  (Roll: {result.student.roll_number})
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={
                    result.already_marked
                      ? "text-amber-700 font-semibold flex items-center gap-1"
                      : "text-emerald-700 font-semibold flex items-center gap-1"
                  }
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Present{" "}
                  {result.already_marked ? "(Already Recorded)" : ""}
                </span>
                <Link
                  href={`/view-attendance?studentId=${result.student.id}&roll=${encodeURIComponent(
                    result.student.roll_number
                  )}`}
                  className="font-semibold text-indigo-600 hover:text-indigo-800 underline"
                >
                  View Details &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* ── Confidence Score & Metrics ───────────────────────────── */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-2">
          <span>
            Similarity Score:{" "}
            <strong className="text-slate-700">
              {result?.score !== undefined ? result.score.toFixed(4) : "—"}
            </strong>
          </span>
          <span>
            Match Threshold: <strong className="text-slate-700">0.75</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

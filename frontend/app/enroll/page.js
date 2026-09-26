"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  AudioLines,
  Mic,
  Square,
  RotateCcw,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Play,
  Volume2,
  Sparkles,
} from "lucide-react";

const BASE_PHRASES = [
  "My name is {name}",
  "{name} Present",
  "Voice Attendance Registration",
  "Computer Science Department",
  "Attendance System",
];

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

export default function EnrollPage() {
  // ── Form State ───────────────────────────────────────────────────────
  const [step, setStep] = useState(1); // 1: Info, 2: Recording (0-4), 3: Review/Submit, 4: Success
  const [name, setName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [department, setDepartment] = useState("Computer Science");

  // ── Recording State ──────────────────────────────────────────────────
  const [currentPhraseIdx, setCurrentPhraseIdx] = useState(0);
  const [samples, setSamples] = useState([null, null, null, null, null]); // Array of { blob, url }
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState(null); // 3, 2, 1
  const [recordSecondsLeft, setRecordSecondsLeft] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [enrollResult, setEnrollResult] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  // Dynamic phrases tailored to student's name
  const studentName = name.trim() || "Student";
  const phrases = BASE_PHRASES.map((p) => p.replace(/{name}/g, studentName));

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      samples.forEach((s) => {
        if (s?.url) URL.revokeObjectURL(s.url);
      });
    };
  }, [samples]);

  // ── Step 1: Info Validation ──────────────────────────────────────────
  const handleInfoSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !rollNumber.trim()) {
      setError("Please provide both your name and roll number.");
      return;
    }
    setError(null);
    setStep(2);
  };

  // ── MediaRecorder Controls ───────────────────────────────────────────
  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // 3-2-1 Countdown
      setCountdown(3);
      const countInterval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countInterval);
            beginAudioCapture(stream);
            return null;
          }
          return prev - 1;
        });
      }, 900);
    } catch (err) {
      setError("Microphone access denied. Please grant microphone permissions.");
    }
  };

  const beginAudioCapture = (stream) => {
    setIsRecording(true);
    setRecordSecondsLeft(4);

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

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const audioBlob = new Blob(audioChunksRef.current, {
        type: mediaRecorder.mimeType || "audio/webm",
      });
      const audioUrl = URL.createObjectURL(audioBlob);

      setSamples((prev) => {
        const next = [...prev];
        if (next[currentPhraseIdx]?.url) {
          URL.revokeObjectURL(next[currentPhraseIdx].url);
        }
        next[currentPhraseIdx] = { blob: audioBlob, url: audioUrl };
        return next;
      });
      setIsRecording(false);
    };

    mediaRecorder.start();

    // 4-second timer
    let remaining = 4;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setRecordSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }
    }, 1000);
  };

  const stopRecordingEarly = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleNextPhrase = () => {
    if (currentPhraseIdx < 4) {
      setCurrentPhraseIdx(currentPhraseIdx + 1);
    } else {
      setStep(3); // Go to review
    }
  };

  // ── Submit Enrollment ─────────────────────────────────────────────────
  const handleSubmitEnrollment = async () => {
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("roll_number", rollNumber.trim());
      formData.append("department", department.trim());

      samples.forEach((sample, i) => {
        if (sample?.blob) {
          formData.append("audio_files", sample.blob, `phrase_${i + 1}.webm`);
        }
      });

      const res = await fetch(`${BACKEND_URL}/students/enroll`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Enrollment failed");
      }

      setEnrollResult(data);
      setStep(4); // Success screen
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-4 pb-12">
      {/* ── Title Header ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-indigo-50 rounded-lg p-2">
          <AudioLines className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Voice Enrollment</h1>
          <p className="text-slate-500 text-sm">
            Create your unique 192-dimensional voiceprint for instant attendance
          </p>
        </div>
      </div>

      {/* ── Error Banner ────────────────────────────────────────────── */}
      {error && (
        <div className="mt-4 flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="text-sm text-rose-700">
            <p className="font-semibold">Enrollment Notice</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* STEP 1: Student Information                                     */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <form
          onSubmit={handleInfoSubmit}
          className="mt-6 bg-white rounded-xl border border-slate-200 p-6 space-y-5 shadow-sm"
        >
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Prakhar Pankaj"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Roll Number *
              </label>
              <input
                type="text"
                required
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                placeholder="e.g. 21"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Department
              </label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Computer Science"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-2 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            Continue to Voice Recording
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* STEP 2: 5-Phrase Voice Recording                                */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="mt-6 space-y-6">
          {/* Stepper Progress */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
              <span>Sample {currentPhraseIdx + 1} of 5</span>
              <span>{Math.round(((currentPhraseIdx + (samples[currentPhraseIdx] ? 1 : 0)) / 5) * 100)}% Complete</span>
            </div>
            <div className="flex gap-2">
              {phrases.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => !isRecording && setCurrentPhraseIdx(i)}
                  className={`h-2 flex-1 rounded-full transition-all ${
                    samples[i]
                      ? "bg-emerald-500"
                      : i === currentPhraseIdx
                      ? "bg-indigo-600"
                      : "bg-slate-200"
                  }`}
                  title={`Phrase ${i + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Current Phrase Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center shadow-sm relative overflow-hidden">
            <p className="text-xs uppercase tracking-wider font-semibold text-indigo-600 mb-2">
              Enrollment Phrase {currentPhraseIdx + 1}
            </p>

            <p className="text-2xl font-extrabold text-slate-900 my-4 leading-snug">
              &ldquo;{phrases[currentPhraseIdx]}&rdquo;
            </p>

            <p className="text-xs text-slate-400 mb-8 max-w-sm mx-auto">
              Speak naturally at normal speed and clear volume.
            </p>

            {/* Countdown Overlay */}
            {countdown !== null && (
              <div className="my-6">
                <div className="text-5xl font-black text-indigo-600 animate-pulse">
                  {countdown}
                </div>
                <p className="text-xs text-slate-500 mt-2 font-medium">Get ready to speak...</p>
              </div>
            )}

            {/* Active Recording State */}
            {isRecording && (
              <div className="my-6 space-y-4">
                <div className="relative inline-flex items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-20 w-20 rounded-full bg-rose-400 opacity-75"></span>
                  <div className="relative w-16 h-16 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg">
                    <Mic className="w-8 h-8 animate-bounce" />
                  </div>
                </div>
                <div className="text-sm font-semibold text-rose-600">
                  Recording... speak now! ({recordSecondsLeft}s remaining)
                </div>
                <button
                  onClick={stopRecordingEarly}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors"
                >
                  <Square className="w-3.5 h-3.5" /> Stop Early
                </button>
              </div>
            )}

            {/* Idle / Ready to Record State */}
            {!isRecording && countdown === null && !samples[currentPhraseIdx] && (
              <button
                onClick={startRecording}
                className="mx-auto flex items-center gap-3 bg-indigo-600 text-white px-8 py-3.5 rounded-full font-semibold hover:bg-indigo-700 active:scale-95 transition-all shadow-md hover:shadow-lg"
              >
                <Mic className="w-5 h-5" />
                Record Phrase {currentPhraseIdx + 1}
              </button>
            )}

            {/* Recorded State with Playback Preview */}
            {!isRecording && countdown === null && samples[currentPhraseIdx] && (
              <div className="space-y-5">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 max-w-sm mx-auto flex items-center justify-center gap-2 text-emerald-700 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Sample {currentPhraseIdx + 1} recorded successfully
                </div>

                <div className="max-w-xs mx-auto">
                  <audio
                    controls
                    src={samples[currentPhraseIdx].url}
                    className="w-full h-10"
                  />
                </div>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={startRecording}
                    className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" /> Re-record
                  </button>

                  <button
                    onClick={handleNextPhrase}
                    className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    {currentPhraseIdx < 4 ? "Accept & Next Phrase" : "Review & Complete"}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center px-1">
            <button
              onClick={() => setStep(1)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Edit Student Info
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* STEP 3: Review All 5 Samples & Submit                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <div className="mt-6 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{name}</h2>
                <p className="text-xs text-slate-500">
                  Roll No: {rollNumber} • {department}
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                5 of 5 Samples Ready
              </span>
            </div>

            <div className="space-y-3">
              {phrases.map((phrase, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100"
                >
                  <div className="text-left flex-1 mr-2">
                    <p className="text-xs font-bold text-slate-700">Sample {i + 1}</p>
                    <p className="text-xs text-slate-500 truncate">&ldquo;{phrase}&rdquo;</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {samples[i] && (
                      <audio controls src={samples[i].url} className="h-8 w-44" />
                    )}
                    <button
                      onClick={() => {
                        setCurrentPhraseIdx(i);
                        setStep(2);
                      }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600"
                      title="Re-record sample"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleSubmitEnrollment}
              disabled={loading}
              className="w-full mt-6 bg-indigo-600 text-white py-3.5 rounded-lg font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-md disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating Voiceprint Centroid...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Finalize & Register Voiceprint
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* STEP 4: Success Screen                                          */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {step === 4 && enrollResult && (
        <div className="mt-6 bg-white rounded-xl border border-slate-200 p-8 text-center shadow-sm space-y-6">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-900">Enrollment Complete!</h2>
            <p className="text-slate-500 text-sm mt-1">
              Your voiceprint has been created and saved to the database.
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 text-left border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">Student Name:</span>
              <span className="font-bold text-slate-800">{enrollResult.student?.name}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">Roll Number:</span>
              <span className="font-bold text-slate-800">{enrollResult.student?.roll_number}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">Embedding Dimension:</span>
              <span className="font-bold text-slate-800">{enrollResult.embedding_dim}-dim vector</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Internal Sample Consistency:</span>
              <span className="font-bold text-emerald-600">
                {(enrollResult.avg_internal_similarity * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Link
              href="/mark-attendance"
              className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              Test Attendance Now
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/"
              className="flex-1 border border-slate-300 text-slate-700 py-3 rounded-lg font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  User,
  GraduationCap,
  CalendarCheck,
  CalendarX,
  Clock,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Search,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AudioLines,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

function ViewAttendanceContent() {
  const searchParams = useSearchParams();
  const { token } = useAuth();

  const initialStudentId = searchParams.get("studentId");
  const initialRoll = searchParams.get("roll");

  const [studentId, setStudentId] = useState(initialStudentId || "");
  const [studentProfile, setStudentProfile] = useState(null);
  const [rollInput, setRollInput] = useState(initialRoll || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [records, setRecords] = useState(null);   // attendance record array
  const [percentage, setPercentage] = useState(null); // { percentage, present_count, total_count }
  const [noLinkedStudent, setNoLinkedStudent] = useState(false);

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  // ── Fetch attendance history + percentage in parallel ────────────
  const fetchAttendanceData = useCallback(async (id) => {
    setLoading(true);
    setError(null);

    try {
      const [historyRes, pctRes] = await Promise.all([
        fetch(`${BACKEND_URL}/attendance/${id}`, { headers: authHeaders }),
        fetch(`${BACKEND_URL}/attendance/${id}/percentage`, { headers: authHeaders }),
      ]);

      // Handle 401 from either
      if (historyRes.status === 401 || pctRes.status === 401) {
        setError("Session expired. Please log in again.");
        setRecords(null);
        setPercentage(null);
        setLoading(false);
        return;
      }

      if (!historyRes.ok) {
        const data = await historyRes.json().catch(() => ({}));
        throw new Error(data.message || "Failed to load attendance records");
      }

      if (!pctRes.ok) {
        const data = await pctRes.json().catch(() => ({}));
        throw new Error(data.message || "Failed to load attendance percentage");
      }

      const [historyData, pctData] = await Promise.all([
        historyRes.json(),
        pctRes.json(),
      ]);

      setRecords(Array.isArray(historyData) ? historyData : []);
      setPercentage(pctData);
    } catch (err) {
      setError(err.message || "Failed to load attendance history");
      setRecords(null);
      setPercentage(null);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  // ── Lookup student by roll number ────────────────────────────────
  const lookupByRoll = useCallback(async (roll) => {
    const q = roll.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setNoLinkedStudent(false);

    try {
      const res = await fetch(
        `${BACKEND_URL}/students/search?q=${encodeURIComponent(q)}`,
        { headers: authHeaders }
      );
      const searchData = await res.json();

      if (!res.ok) throw new Error(searchData.message || "Failed to find student");

      const list = Array.isArray(searchData) ? searchData : (searchData.results || []);
      const match = list.find(
        (s) => s.roll_number.toLowerCase() === q.toLowerCase()
      ) || list[0];

      if (!match) {
        setError(`No student found with roll number "${q}".`);
        setRecords(null);
        setPercentage(null);
        setLoading(false);
        return;
      }

      setStudentId(match.id);
      setStudentProfile(match);
      await fetchAttendanceData(match.id);
    } catch (err) {
      setError(err.message || "Failed to lookup student");
      setRecords(null);
      setPercentage(null);
      setLoading(false);
    }
  }, [authHeaders, fetchAttendanceData]);

  // ── Resolve "my" student record via GET /students/me ─────────────
  const resolveMyStudent = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setNoLinkedStudent(false);

    try {
      const res = await fetch(`${BACKEND_URL}/students/me`, {
        headers: authHeaders,
      });

      if (res.status === 404) {
        setNoLinkedStudent(true);
        setLoading(false);
        return;
      }

      if (res.status === 401) {
        setError("Session expired. Please log in again.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to resolve student profile");
      }

      const data = await res.json();
      const student = data.student;
      setStudentId(student.id);
      setStudentProfile(student);
      await fetchAttendanceData(student.id);
    } catch (err) {
      setError(err.message || "Failed to load student profile");
      setLoading(false);
    }
  }, [authHeaders, fetchAttendanceData, token]);

  // ── On mount: resolve student automatically ──────────────────────
  useEffect(() => {
    if (initialStudentId) {
      fetchAttendanceData(initialStudentId);
    } else if (initialRoll) {
      lookupByRoll(initialRoll);
    } else {
      // Try to resolve the current user's student record
      resolveMyStudent();
    }
  }, [initialStudentId, initialRoll, fetchAttendanceData, lookupByRoll, resolveMyStudent]);

  const handleLookupSubmit = (e) => {
    e.preventDefault();
    if (!rollInput.trim()) return;
    lookupByRoll(rollInput);
  };

  const handleReset = () => {
    setRecords(null);
    setPercentage(null);
    setStudentProfile(null);
    setStudentId("");
    setRollInput("");
    setError(null);
    setNoLinkedStudent(false);
  };

  const getStatusColor = (pct) => {
    if (pct >= 75) {
      return {
        text: "text-emerald-600",
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        status: "Good Standing (>= 75%)",
      };
    }
    if (pct >= 60) {
      return {
        text: "text-amber-600",
        bg: "bg-amber-50",
        border: "border-amber-200",
        status: "Low Attendance Warning (60-74%)",
      };
    }
    return {
      text: "text-rose-600",
      bg: "bg-rose-50",
      border: "border-rose-200",
      status: "Shortage Risk (< 60%)",
    };
  };

  const pctValue = percentage?.percentage ?? 0;
  const presentCount = percentage?.present_count ?? 0;
  const totalCount = percentage?.total_count ?? 0;
  const missedClasses = Math.max(0, totalCount - presentCount);
  const hasData = records !== null;

  return (
    <div className="max-w-3xl mx-auto mt-4 pb-16">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-50 rounded-lg p-2">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Attendance History</h1>
            <p className="text-slate-500 text-sm">
              Live attendance records and percentage analysis
            </p>
          </div>
        </div>

        {hasData && (
          <button
            onClick={handleReset}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            Lookup Other
          </button>
        )}
      </div>

      {/* ── No Linked Student Message ─────────────────────────── */}
      {noLinkedStudent && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center mb-8">
          <AudioLines className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-800 mb-2">
            No student record linked to your account
          </h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto mb-4">
            You need to complete voice enrollment before you can view your attendance.
            This one-time process registers your voice profile.
          </p>
          <Link
            href="/enroll"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <AudioLines className="w-4 h-4" />
            Complete Voice Enrollment
          </Link>

          {/* Still allow manual lookup */}
          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-xs text-slate-400 mb-3">
              Or look up another student by roll number:
            </p>
            <form onSubmit={handleLookupSubmit} className="flex gap-2 max-w-md mx-auto">
              <div className="relative flex-1">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={rollInput}
                  onChange={(e) => setRollInput(e.target.value)}
                  placeholder="e.g. 21 or Prakhar Pankaj"
                  className="w-full rounded-lg border border-slate-300 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !rollInput.trim()}
                className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                Look Up
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Lookup Form (if no data loaded and no "no linked" state) ── */}
      {!hasData && !noLinkedStudent && !loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8 shadow-xs">
          <h2 className="text-sm font-semibold text-slate-800 mb-2">
            Enter Roll Number or Name to View Records
          </h2>
          <form onSubmit={handleLookupSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={rollInput}
                onChange={(e) => setRollInput(e.target.value)}
                placeholder="e.g. 21 or Prakhar Pankaj"
                className="w-full rounded-lg border border-slate-300 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !rollInput.trim()}
              className="bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center gap-2"
            >
              View Attendance
            </button>
          </form>
        </div>
      )}

      {/* ── Error Banner ──────────────────────────────────────── */}
      {error && (
        <div className="mb-6 bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center gap-3 text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Loading Spinner ───────────────────────────────────── */}
      {loading && !hasData && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Fetching attendance logs...</p>
        </div>
      )}

      {/* ── Attendance Dashboard ──────────────────────────────── */}
      {hasData && (
        <div className="space-y-6">
          {/* Student details header */}
          {studentProfile && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                  Student Profile
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                  {studentProfile.name}
                </h2>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1 font-medium">
                    <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                    Roll: {studentProfile.roll_number}
                  </span>
                  {studentProfile.department && (
                    <span>Dept: {studentProfile.department}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-xs px-3 py-1 rounded-full font-semibold border ${
                    getStatusColor(pctValue).bg
                  } ${getStatusColor(pctValue).border} ${
                    getStatusColor(pctValue).text
                  }`}
                >
                  {getStatusColor(pctValue).status}
                </span>
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 text-center flex flex-col items-center justify-center">
              <div className="bg-emerald-50 rounded-full p-2.5 mb-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-3xl font-extrabold text-slate-900">
                {pctValue}%
              </span>
              <p className="text-xs font-medium text-slate-400 mt-1">Percentage</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 text-center flex flex-col items-center justify-center">
              <div className="bg-indigo-50 rounded-full p-2.5 mb-2">
                <CalendarCheck className="w-5 h-5 text-indigo-600" />
              </div>
              <span className="text-3xl font-extrabold text-slate-900">
                {presentCount}
              </span>
              <p className="text-xs font-medium text-slate-400 mt-1">Attended</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 text-center flex flex-col items-center justify-center">
              <div className="bg-rose-50 rounded-full p-2.5 mb-2">
                <CalendarX className="w-5 h-5 text-rose-600" />
              </div>
              <span className="text-3xl font-extrabold text-slate-900">
                {missedClasses}
              </span>
              <p className="text-xs font-medium text-slate-400 mt-1">Missed</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 text-center flex flex-col items-center justify-center">
              <div className="bg-slate-50 rounded-full p-2.5 mb-2">
                <BarChart3 className="w-5 h-5 text-slate-600" />
              </div>
              <span className="text-3xl font-extrabold text-slate-900">
                {totalCount}
              </span>
              <p className="text-xs font-medium text-slate-400 mt-1">Total Classes</p>
            </div>
          </div>

          {/* Attendance Log Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Attendance Records</h3>
              <span className="text-xs text-slate-400">
                {records.length} recorded sessions
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                      Date
                    </th>
                    <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                      Time
                    </th>
                    <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                      Voice Confidence
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.length > 0 ? (
                    records.map((record) => {
                      const recordTime = record.time
                        ? new Date(record.time).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—";

                      return (
                        <tr key={record.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-slate-900">
                            {record.date}
                          </td>
                          <td className="px-5 py-3.5 text-slate-500 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {recordTime}
                          </td>
                          <td className="px-5 py-3.5">
                            {record.status === "present" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                Present
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                <XCircle className="w-3 h-3" />
                                Absent
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-slate-600">
                            {record.verification_score !== null &&
                            record.verification_score !== undefined ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
                                <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                                {Math.round(record.verification_score * 100)}%
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">Manual</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-slate-400 italic">
                        No attendance records yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ViewAttendancePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
        </div>
      }
    >
      <ViewAttendanceContent />
    </Suspense>
  );
}

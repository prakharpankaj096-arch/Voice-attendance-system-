"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Search as SearchIcon,
  Loader2,
  User,
  GraduationCap,
  CalendarCheck,
  TrendingUp,
  ArrowRight,
  Mic,
  X,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

export default function SearchPage() {
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isListening, setIsListening] = useState(false);

  // Track the latest request to prevent stale responses
  const abortControllerRef = useRef(null);

  const handleSearch = useCallback(async (searchQuery) => {
    const q = (searchQuery !== undefined ? searchQuery : query).trim();
    if (!q) return;

    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch(
        `${BACKEND_URL}/students/search?q=${encodeURIComponent(q)}`,
        { headers, signal: controller.signal }
      );

      // If this request was aborted (superseded), do nothing
      if (controller.signal.aborted) return;

      if (res.status === 401) {
        setError("Session expired. Please log in again.");
        setResults([]);
        setLoading(false);
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to search students");
      }

      // Only apply results if this is still the active request
      if (!controller.signal.aborted) {
        setResults(Array.isArray(data) ? data : (data.results || []));
      }
    } catch (err) {
      // Ignore abort errors — they mean a newer search replaced this one
      if (err.name === "AbortError") return;
      setError(err.message || "Network error while searching");
      setResults([]);
    } finally {
      // Only clear loading if this is still the active request
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [query, token]);

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSearch();
  };

  const handleClear = () => {
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setQuery("");
    setResults([]);
    setSearched(false);
    setLoading(false);
    setError(null);
  };

  // Voice speech-to-text for search
  const handleVoiceSearch = () => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice search is not supported by your browser. Please use Chrome or Edge.");
      return;
    }

    if (isListening) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        // Clean up common search phrases: "search Prakhar" -> "Prakhar"
        const cleanQuery = transcript
          .replace(/^(search|find|look up|lookup)\s+(for\s+|student\s+)?/i, "")
          .trim();
        setQuery(cleanQuery);
        handleSearch(cleanQuery);
      };

      recognition.onerror = (err) => {
        console.error("Speech recognition error:", err);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error(err);
      setIsListening(false);
    }
  };

  const getAttendanceBadge = (percentage) => {
    if (percentage >= 75) {
      return {
        bg: "bg-emerald-50 border-emerald-200 text-emerald-700",
        label: "Good Standing",
      };
    }
    if (percentage >= 60) {
      return {
        bg: "bg-amber-50 border-amber-200 text-amber-700",
        label: "Average",
      };
    }
    return {
      bg: "bg-rose-50 border-rose-200 text-rose-700",
      label: "Low Attendance",
    };
  };

  return (
    <div className="max-w-2xl mx-auto mt-4 pb-12">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-violet-50 rounded-lg p-2">
          <SearchIcon className="w-5 h-5 text-violet-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Search Student</h1>
      </div>
      <p className="text-slate-500 text-sm mb-8 ml-12">
        Look up student records, roll numbers, and live attendance percentages.
      </p>

      {/* ── Search Bar ────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="flex gap-2 mb-8">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or roll number..."
            className="w-full rounded-lg border border-slate-300 pl-10 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          />
          {query ? (
            <button
              type="button"
              onClick={handleClear}
              title="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleVoiceSearch}
              title={isListening ? "Listening..." : "Search with Voice"}
              className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors ${
                isListening
                  ? "bg-rose-100 text-rose-600 animate-pulse"
                  : "text-slate-400 hover:text-indigo-600 hover:bg-slate-100"
              }`}
            >
              <Mic className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching...
            </>
          ) : (
            "Search"
          )}
        </button>
      </form>

      {/* ── Error Banner ──────────────────────────────────────── */}
      {error && (
        <div className="mb-6 bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center gap-3 text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Results Area ──────────────────────────────────────── */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Searching student database...</p>
        </div>
      ) : searched && results.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <User className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-800 mb-1">No students found</h3>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">
            No matching records found for &ldquo;{query}&rdquo;. Try searching by full name or exact roll number.
          </p>
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Found {results.length} student{results.length > 1 ? "s" : ""}
          </p>
          {results.map((student) => {
            const badge = getAttendanceBadge(student.attendance_percentage || 0);
            return (
              <div
                key={student.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-base">{student.name}</h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border ${badge.bg}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                      Roll: <strong className="text-slate-700">{student.roll_number}</strong>
                    </span>
                    {student.department && (
                      <span>Dept: {student.department}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <CalendarCheck className="w-3.5 h-3.5 text-slate-400" />
                      Attendance
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 justify-between sm:justify-end">
                  <div className="text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <span className="text-xl font-extrabold text-slate-900">
                        {student.attendance_percentage || 0}%
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">Attendance</p>
                  </div>

                  <Link
                    href={`/view-attendance?studentId=${student.id}&roll=${encodeURIComponent(student.roll_number)}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-lg transition-colors"
                  >
                    View Logs
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Initial prompt */
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <SearchIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-800 mb-1">Find Any Student</h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            Search by student name or roll number to check current attendance percentage and records.
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  UserCheck,
  UserX,
  TrendingUp,
  Mic,
  BarChart3,
  Search,
  AudioLines,
  Loader2,
  WifiOff,
} from "lucide-react";

/**
 * Dashboard — Landing page after login.
 * Fetches live stats from the Node backend on mount.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

const statsMeta = [
  { key: "total_students", label: "Total Students", Icon: Users, accent: "text-indigo-600", bg: "bg-indigo-50" },
  { key: "present_today", label: "Present Today", Icon: UserCheck, accent: "text-emerald-600", bg: "bg-emerald-50" },
  { key: "absent_today", label: "Absent Today", Icon: UserX, accent: "text-rose-600", bg: "bg-rose-50" },
  { key: "attendance_rate", label: "Attendance Rate", Icon: TrendingUp, accent: "text-amber-600", bg: "bg-amber-50", suffix: "%" },
];

const actions = [
  { href: "/mark-attendance", label: "Mark Attendance", desc: "Speak your name to record attendance", Icon: Mic, accent: "text-indigo-600", bg: "bg-indigo-50" },
  { href: "/view-attendance", label: "View Attendance", desc: "Check your attendance history", Icon: BarChart3, accent: "text-emerald-600", bg: "bg-emerald-50" },
  { href: "/search", label: "Search Student", desc: "Look up any student by name or roll", Icon: Search, accent: "text-violet-600", bg: "bg-violet-50" },
  { href: "/enroll", label: "Voice Enrollment", desc: "One-time voice profile setup", Icon: AudioLines, accent: "text-rose-600", bg: "bg-rose-50" },
];

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/stats`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();
        setStats(data);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Dashboard</h1>
      <p className="text-slate-500 text-sm mb-8">
        Welcome back. Here&apos;s today&apos;s attendance overview.
      </p>

      {/* ── Error banner ───────────────────────────────────────── */}
      {error && (
        <div className="mb-6 bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
          <WifiOff className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-rose-700">
              Could not connect to backend
            </p>
            <p className="text-xs text-rose-500 mt-0.5">
              {error} — make sure the Node backend is running on{" "}
              <code className="bg-rose-100 px-1 rounded">
                {BACKEND_URL}
              </code>
            </p>
          </div>
        </div>
      )}

      {/* ── Stats cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {statsMeta.map(({ key, label, Icon, accent, bg, suffix }) => (
          <div
            key={key}
            className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4"
          >
            <div className={`${bg} rounded-lg p-2.5 shrink-0`}>
              <Icon className={`w-5 h-5 ${accent}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">{label}</p>
              {loading ? (
                <Loader2
                  className="w-6 h-6 text-slate-300 animate-spin mt-1"
                />
              ) : (
                <p className={`text-3xl font-bold ${accent} mt-0.5`}>
                  {stats ? `${stats[key]}${suffix || ""}` : "—"}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Quick actions ──────────────────────────────────────── */}
      <h2 className="text-lg font-semibold text-slate-900 mb-4">
        Quick Actions
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {actions.map(({ href, label, desc, Icon, accent, bg }) => (
          <Link
            key={href}
            href={href}
            className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all"
          >
            <div
              className={`${bg} rounded-lg p-2.5 w-fit mb-3 group-hover:scale-105 transition-transform`}
            >
              <Icon className={`w-5 h-5 ${accent}`} />
            </div>
            <h3 className="font-semibold text-slate-900 text-sm">{label}</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {desc}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

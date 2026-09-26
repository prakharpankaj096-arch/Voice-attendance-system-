"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import {
  ShieldAlert,
  UserPlus,
  Users,
  ClipboardList,
  Loader2,
  ShieldX,
} from "lucide-react";

/**
 * Admin Panel — protected route.
 * Redirects non-admins to dashboard with an error message.
 */

const adminActions = [
  {
    label: "Add Student",
    description: "Register a new student and trigger voice enrollment",
    Icon: UserPlus,
    accent: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    label: "Manage Students",
    description: "Edit, remove, or reset voice data for existing students",
    Icon: Users,
    accent: "text-indigo-600",
    bg: "bg-indigo-50",
  },
  {
    label: "Attendance Logs",
    description: "View all attendance records, filter by student or date",
    Icon: ClipboardList,
    accent: "text-amber-600",
    bg: "bg-amber-50",
  },
];

export default function AdminPage() {
  const { user, isLoggedIn, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (loading) return; // Wait for auth to resolve

    if (!isLoggedIn) {
      router.push("/login");
      return;
    }

    if (!isAdmin) {
      setRedirecting(true);
      // Short delay so the user sees the message before redirect
      const timer = setTimeout(() => router.push("/"), 2500);
      return () => clearTimeout(timer);
    }
  }, [loading, isLoggedIn, isAdmin, router]);

  // ── Loading state ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  // ── Not admin → show access denied ────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center">
        <div className="bg-rose-50 rounded-full p-4 w-fit mx-auto mb-4">
          <ShieldX className="w-8 h-8 text-rose-500" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">
          Access Denied
        </h1>
        <p className="text-slate-500 text-sm">
          You don&apos;t have admin privileges to access this page.
          <br />
          Redirecting to the dashboard...
        </p>
      </div>
    );
  }

  // ── Admin content ─────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-rose-50 rounded-lg p-2">
          <ShieldAlert className="w-5 h-5 text-rose-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>
      </div>
      <p className="text-slate-500 text-sm mb-8 ml-12">
        Manage students and attendance records. Logged in as{" "}
        <span className="font-medium text-slate-700">{user?.email}</span>.
      </p>

      {/* ── Admin actions ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {adminActions.map(({ label, description, Icon, accent, bg }) => (
          <button
            key={label}
            className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-indigo-300 hover:shadow-md transition-all group"
          >
            <div
              className={`${bg} rounded-lg p-2.5 w-fit mb-3 group-hover:scale-105 transition-transform`}
            >
              <Icon className={`w-5 h-5 ${accent}`} />
            </div>
            <h3 className="font-semibold text-slate-900 text-sm">{label}</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {description}
            </p>
          </button>
        ))}
      </div>

      {/* ── Student list ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                Name
              </th>
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                Roll Number
              </th>
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                Voice Enrolled
              </th>
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                colSpan={4}
                className="px-5 py-10 text-center text-slate-400 italic"
              >
                No students registered yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

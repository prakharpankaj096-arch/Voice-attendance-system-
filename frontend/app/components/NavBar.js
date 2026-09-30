"use client";

import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  Mic,
  BarChart3,
  Search,
  LogIn,
  LogOut,
  User,
  Loader2,
  KeyRound,
} from "lucide-react";

const navLinks = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/mark-attendance", label: "Mark Attendance", Icon: Mic },
  { href: "/view-attendance", label: "View Attendance", Icon: BarChart3 },
  { href: "/search", label: "Search Student", Icon: Search },
];

export default function NavBar() {
  const { user, isLoggedIn, isAdmin, loading, logout } = useAuth();

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center">
        <Link
          href="/"
          className="font-bold text-lg tracking-tight text-indigo-600 flex items-center gap-2"
        >
          <Mic className="w-5 h-5" />
          Voice Attendance
        </Link>

        <div className="flex items-center gap-1 ml-auto">
          {navLinks.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}

          {/* ── Auth section ───────────────────────────────────── */}
          {loading ? (
            <Loader2 className="w-4 h-4 text-slate-400 animate-spin ml-3" />
          ) : isLoggedIn ? (
            <div className="flex items-center gap-2 ml-3">
              <span className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-500">
                <User className="w-4 h-4" />
                {user.name || user.roll_number || user.email}
              </span>
              {!isAdmin && (
                <Link
                  href="/change-password"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  <KeyRound className="w-4 h-4" />
                  Change Password
                </Link>
              )}
              <button
                onClick={logout}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 ml-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

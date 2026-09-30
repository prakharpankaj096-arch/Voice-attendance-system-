"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import {
  LogIn,
  GraduationCap,
  Shield,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  KeyRound,
} from "lucide-react";

/**
 * Unified Single Login Page
 * Supports both Student (Roll Number + Password) and Admin (Admin ID + Password).
 */
export default function LoginPage() {
  const { login, isLoggedIn, isAdmin } = useAuth();
  const router = useRouter();

  // Role selector: "student" | "admin"
  const [role, setRole] = useState("student");

  // Form input fields
  const [identifier, setIdentifier] = useState(""); // roll_number for student, admin_id for admin
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Status & feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // If already logged in, redirect appropriately
  useEffect(() => {
    if (isLoggedIn) {
      if (isAdmin) {
        router.push("/admin");
      } else {
        router.push("/");
      }
    }
  }, [isLoggedIn, isAdmin, router]);

  if (isLoggedIn) {
    return null;
  }

  const handleRoleChange = (newRole) => {
    if (newRole !== role) {
      setRole(newRole);
      setError(null);
      setPassword("");
      // Keep or clear identifier if needed
      setIdentifier("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const trimmedIdentifier = identifier.trim();

    if (!trimmedIdentifier) {
      setError(
        role === "student"
          ? "Please enter your Roll Number."
          : "Please enter your Admin ID."
      );
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);

    try {
      if (role === "student") {
        await login({
          roll_number: trimmedIdentifier,
          password,
          role: "student",
        });
        router.push("/");
      } else {
        await login({
          admin_id: trimmedIdentifier,
          password,
          role: "admin",
        });
        router.push("/admin");
      }
    } catch (err) {
      // Map error into a friendly, non-technical message
      let message = err.message || "Authentication failed.";

      if (/not activated/i.test(message)) {
        message =
          "Your account has not been activated yet. Please click 'First time? Set your password' below.";
      } else if (/invalid|not found|credentials|wrong/i.test(message)) {
        message =
          role === "student"
            ? "Invalid Roll Number or password. Please verify your credentials."
            : "Invalid Admin ID or password. Please verify your credentials.";
      } else if (/network|failed to fetch/i.test(message)) {
        message = "Unable to connect to authentication server. Please check your connection.";
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-6 mb-12 px-4">
      {/* ── College Portal Branding & Header ────────────────────────────── */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-50 border border-indigo-100 rounded-2xl mb-3 shadow-sm">
          <LogIn className="w-7 h-7 text-indigo-600" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          LOGIN
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Voice Biometric Attendance System
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-sm">
        {/* ── Role Selector: [ STUDENT ] [ ADMIN ] ─────────────────────────── */}
        <div
          role="tablist"
          aria-label="Login Role Selection"
          className="grid grid-cols-2 p-1.5 bg-slate-100/90 rounded-xl mb-6 gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={role === "student"}
            onClick={() => handleRoleChange("student")}
            disabled={loading}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-150 ${
              role === "student"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>STUDENT</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={role === "admin"}
            onClick={() => handleRoleChange("admin")}
            disabled={loading}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-150 ${
              role === "admin"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>ADMIN</span>
          </button>
        </div>

        {/* ── Authentication Error State ──────────────────────────────────── */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3.5 mb-5 text-sm"
          >
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <p className="leading-snug">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ── Primary Identifier (Roll Number or Admin ID) ───────────────── */}
          <div>
            <label
              htmlFor={role === "student" ? "roll_number" : "admin_id"}
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              {role === "student" ? "Roll Number" : "Admin ID"}
            </label>
            <input
              id={role === "student" ? "roll_number" : "admin_id"}
              name={role === "student" ? "roll_number" : "admin_id"}
              type="text"
              required
              disabled={loading}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={
                role === "student" ? "e.g. 21 or CS-101" : "e.g. admin"
              }
              autoComplete="username"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors disabled:bg-slate-50"
            />
          </div>

          {/* ── Password Field with Visibility Toggle ─────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
              >
                Password
              </label>
            </div>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors disabled:bg-slate-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* ── Submit Button: [ LOGIN ] ──────────────────────────────────── */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-indigo-600 text-white py-2.5 px-4 rounded-xl font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Please wait...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>LOGIN</span>
              </>
            )}
          </button>
        </form>

        {/* ── Student First-Time Setup Link ───────────────────────────────── */}
        {role === "student" && (
          <div className="mt-5 text-center border-t border-slate-100 pt-4">
            <Link
              href="/activate"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <KeyRound className="w-4 h-4" />
              <span>First time? Set your password</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

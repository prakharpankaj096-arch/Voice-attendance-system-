"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { LogIn, UserPlus, Loader2, AlertCircle } from "lucide-react";

/**
 * Login / Signup page.
 * Email + password auth via Supabase.
 */
export default function LoginPage() {
  const { login, signup, isLoggedIn } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

  // If already logged in, redirect to dashboard inside an effect
  useEffect(() => {
    if (isLoggedIn) {
      router.push("/");
    }
  }, [isLoggedIn, router]);

  if (isLoggedIn) {
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === "login") {
        await login(email, password);
        router.push("/");
      } else {
        const result = await signup(email, password);
        if (result.session) {
          // Auto-logged in after signup
          router.push("/enroll");
        } else {
          // Email confirmation required
          setSuccess("Account created! Check your email to confirm, then log in.");
          setMode("login");
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-8">
      <div className="text-center mb-8">
        <div className="bg-indigo-50 rounded-full p-4 w-fit mx-auto mb-4">
          {mode === "login" ? (
            <LogIn className="w-8 h-8 text-indigo-600" />
          ) : (
            <UserPlus className="w-8 h-8 text-indigo-600" />
          )}
        </div>
        <h1 className="text-2xl font-bold text-slate-900">
          {mode === "login" ? "Welcome Back" : "Create Account"}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {mode === "login"
            ? "Sign in to your account"
            : "Sign up to get started with voice enrollment"}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-slate-200 p-6 space-y-5"
      >
        {/* ── Error message ──────────────────────────────────────── */}
        {error && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        )}

        {/* ── Success message ────────────────────────────────────── */}
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <p className="text-sm text-emerald-700">{success}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : mode === "login" ? (
            <LogIn className="w-4 h-4" />
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
          {loading
            ? "Please wait..."
            : mode === "login"
            ? "Sign In"
            : "Create Account"}
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-slate-400">or</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
            setSuccess(null);
          }}
          className="w-full border border-slate-300 text-slate-700 py-2.5 rounded-lg font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
        >
          {mode === "login" ? (
            <>
              <UserPlus className="w-4 h-4" />
              New Student? Create Account
            </>
          ) : (
            <>
              <LogIn className="w-4 h-4" />
              Already have an account? Sign In
            </>
          )}
        </button>
      </form>
    </div>
  );
}

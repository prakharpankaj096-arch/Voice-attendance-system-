"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import {
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

/**
 * First-Time Account Activation & Password Setup Page
 * Requires:
 *  - Roll Number
 *  - One-time Activation Code
 *  - New Password
 *  - Confirm Password
 */
export default function ActivatePage() {
  const router = useRouter();
  const { setSession } = useAuth();

  const [rollNumber, setRollNumber] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const trimmedRoll = rollNumber.trim();
    const trimmedCode = activationCode.trim().toUpperCase();

    // 1. Validation: Prevent activation using only roll number
    if (!trimmedRoll) {
      setError("Please enter your Roll Number.");
      return;
    }

    if (!trimmedCode) {
      setError("One-time activation code is required. Please check the code provided by your administrator.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("Password must contain at least one letter and one number.");
      return;
    }

    if (password !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/auth/activate/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roll_number: trimmedRoll,
          activation_code: trimmedCode,
          password,
          confirm_password: confirmPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Sanitize technical messages for the user
        let friendlyMessage = data.message || "Activation failed. Please check your credentials.";
        if (/expired/i.test(friendlyMessage)) {
          friendlyMessage = "This activation code has expired. Please contact your administrator for a new code.";
        } else if (/invalid|not found/i.test(friendlyMessage)) {
          friendlyMessage = "Invalid Roll Number or activation code. Please check and try again.";
        } else if (/already activated/i.test(friendlyMessage)) {
          friendlyMessage = "This account is already activated. Please go to the login page and sign in.";
        }
        throw new Error(friendlyMessage);
      }

      setSuccess(true);

      // Establish session in AuthContext
      if (data.session && data.user) {
        setSession(data.session, data.user);
      }

      // Proceed to voice enrollment after brief confirmation
      setTimeout(() => {
        router.push(`/enroll?roll_number=${encodeURIComponent(trimmedRoll)}&name=${encodeURIComponent(data.user?.name || "")}`);
      }, 1000);
    } catch (err) {
      setError(err.message || "Failed to activate account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-6 mb-12 px-4">
      {/* ── College Portal Header ────────────────────────────────────────── */}
      <div className="text-center mb-6">
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 w-fit mx-auto mb-3 shadow-sm">
          <ShieldCheck className="w-8 h-8 text-indigo-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          First-Time Account Activation
        </h1>
        <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
          Enter the one-time activation code provided by your administrator to create your login password.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-sm">
        {/* ── Success Banner ──────────────────────────────────────────────── */}
        {success && (
          <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 mb-5 text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-semibold">Password Created Successfully!</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Redirecting to one-time voice enrollment...
              </p>
            </div>
          </div>
        )}

        {/* ── Error Banner ────────────────────────────────────────────────── */}
        {error && !success && (
          <div
            role="alert"
            className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl p-3.5 mb-5 text-sm text-rose-700"
          >
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <p className="leading-snug">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Roll Number */}
          <div>
            <label
              htmlFor="roll_number"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Roll Number
            </label>
            <input
              id="roll_number"
              type="text"
              required
              autoComplete="off"
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              placeholder="e.g. 21 or CS-101"
              disabled={loading || success}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors disabled:bg-slate-50"
            />
          </div>

          {/* Activation Code */}
          <div>
            <label
              htmlFor="activation_code"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              One-Time Activation Code
            </label>
            <div className="relative">
              <input
                id="activation_code"
                type="text"
                required
                autoComplete="off"
                value={activationCode}
                onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                placeholder="ACT-XXXXXX"
                disabled={loading || success}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-sm uppercase text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors disabled:bg-slate-50"
              />
              <KeyRound className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Obtain your 6-character code from the CSE Department Admin.
            </p>
          </div>

          {/* New Password */}
          <div>
            <label
              htmlFor="new_password"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              New Password
            </label>
            <div className="relative">
              <input
                id="new_password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                disabled={loading || success}
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
            <p className="text-xs text-slate-400 mt-1">
              Must contain letters and numbers (min. 6 characters).
            </p>
          </div>

          {/* Confirm Password */}
          <div>
            <label
              htmlFor="confirm_password"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Confirm Password
            </label>
            <div className="relative">
              <input
                id="confirm_password"
                type={showConfirmPassword ? "text" : "password"}
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                disabled={loading || success}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors disabled:bg-slate-50"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || success}
            className="w-full mt-2 bg-indigo-600 text-white py-2.5 px-4 rounded-xl font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Activating Account...
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Activated!
              </>
            ) : (
              <>
                <span>Set Password & Continue</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-5 text-center border-t border-slate-100 pt-4">
          <Link
            href="/login"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            Already have an active account? Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

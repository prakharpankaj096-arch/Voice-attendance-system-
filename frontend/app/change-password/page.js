"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import {
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Lock,
  LogIn,
} from "lucide-react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

/**
 * Student Change Password Page
 * Authenticated students only. Uses POST /students/change-password.
 * Password changes never affect voice enrollment or attendance records.
 */
export default function ChangePasswordPage() {
  const { user, token, isLoggedIn, loading: authLoading } = useAuth();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Redirect unauthenticated users
  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      router.push("/login");
    }
  }, [authLoading, isLoggedIn, router]);

  // Client-side validation matching backend rules
  const validate = () => {
    if (!currentPassword) {
      setError("Please enter your current password.");
      return false;
    }
    if (!newPassword) {
      setError("Please enter a new password.");
      return false;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters long.");
      return false;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError("New password must contain at least one letter and one number.");
      return false;
    }
    if (currentPassword === newPassword) {
      setError("New password must be different from your current password.");
      return false;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!validate()) return;

    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/students/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        let friendlyMessage = data.message || "Failed to change password.";
        if (/incorrect|wrong|invalid/i.test(friendlyMessage)) {
          friendlyMessage = "Current password is incorrect. Please try again.";
        }
        throw new Error(friendlyMessage);
      }

      setSuccess(true);
      // Clear password fields immediately after success
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message || "Failed to change password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Loading state while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  // Unauthenticated state
  if (!isLoggedIn) {
    return (
      <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
        <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Authentication Required</h2>
        <p className="text-sm text-slate-600 mb-6">
          Please sign in to change your password.
        </p>
        <Link
          href="/login"
          className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-lg font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <LogIn className="w-4 h-4" /> Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-6 mb-12 px-4">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-50 border border-indigo-100 rounded-2xl mb-3 shadow-sm">
          <KeyRound className="w-7 h-7 text-indigo-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Change Password
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Update your login password. This does not affect your voice enrollment.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-sm">
        {/* Success Banner */}
        {success && (
          <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 mb-5 text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-semibold">Password Changed Successfully!</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Your new password is now active. Use it for your next login.
              </p>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && !success && (
          <div
            role="alert"
            className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3.5 mb-5 text-sm"
          >
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <p className="leading-snug">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Password */}
          <div>
            <label
              htmlFor="current_password"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Current Password
            </label>
            <div className="relative">
              <input
                id="current_password"
                name="current_password"
                type={showCurrent ? "text" : "password"}
                required
                disabled={loading || success}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors disabled:bg-slate-50"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                aria-label={showCurrent ? "Hide current password" : "Show current password"}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
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
                name="new_password"
                type={showNew ? "text" : "password"}
                required
                minLength={6}
                disabled={loading || success}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors disabled:bg-slate-50"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                aria-label={showNew ? "Hide new password" : "Show new password"}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Must contain letters and numbers (min. 6 characters).
            </p>
          </div>

          {/* Confirm New Password */}
          <div>
            <label
              htmlFor="confirm_password"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Confirm New Password
            </label>
            <div className="relative">
              <input
                id="confirm_password"
                name="confirm_password"
                type={showConfirm ? "text" : "password"}
                required
                minLength={6}
                disabled={loading || success}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors disabled:bg-slate-50"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                <span>Updating Password...</span>
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Password Updated</span>
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Change Password</span>
              </>
            )}
          </button>
        </form>

        {/* Info box */}
        <div className="mt-5 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-500">
          <p className="font-semibold text-slate-700 mb-1">Security Notice:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Changing your password does not affect your voice enrollment.</li>
            <li>Your attendance records remain unchanged.</li>
            <li>Use your new password for all future logins.</li>
          </ul>
        </div>

        {/* Back to Dashboard */}
        <div className="mt-5 text-center border-t border-slate-100 pt-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

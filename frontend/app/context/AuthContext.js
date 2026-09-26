"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext(null);

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);     // { id, email, is_admin, role }
  const [token, setToken] = useState(null);    // JWT access token
  const [loading, setLoading] = useState(true); // true while restoring session

  // ── Restore session on mount ─────────────────────────────────────
  useEffect(() => {
    const savedToken = localStorage.getItem("auth_token");
    if (savedToken) {
      setToken(savedToken);
      fetchMe(savedToken).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // ── Fetch current user info from /auth/me ────────────────────────
  const fetchMe = async (accessToken) => {
    try {
      const res = await fetch(`${BACKEND_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Session expired");
      const data = await res.json();
      setUser(data.user);
    } catch {
      // Token is invalid/expired — clear session
      localStorage.removeItem("auth_token");
      setToken(null);
      setUser(null);
    }
  };

  // ── Login ────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Login failed");

    const accessToken = data.session.access_token;
    localStorage.setItem("auth_token", accessToken);
    setToken(accessToken);
    setUser({ ...data.user, is_admin: false, role: "student" });

    // Fetch full user info (including admin status) in background
    await fetchMe(accessToken);

    return data;
  }, []);

  // ── Signup ───────────────────────────────────────────────────────
  const signup = useCallback(async (email, password) => {
    const res = await fetch(`${BACKEND_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Signup failed");

    // If Supabase returns a session (email confirmation disabled), log in
    if (data.session?.access_token) {
      const accessToken = data.session.access_token;
      localStorage.setItem("auth_token", accessToken);
      setToken(accessToken);
      setUser({ ...data.user, is_admin: false, role: "student" });
      await fetchMe(accessToken);
    }

    return data;
  }, []);

  // ── Logout ───────────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem("auth_token");
    setToken(null);
    setUser(null);
  }, []);

  const value = {
    user,
    token,
    loading,
    isLoggedIn: !!user,
    isAdmin: user?.is_admin || false,
    login,
    signup,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

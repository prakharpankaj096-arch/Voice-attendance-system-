"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext(null);

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);     // { id, email, is_admin, role }
  const [token, setToken] = useState(null);    // JWT access token
  const [loading, setLoading] = useState(true); // true while restoring session

  // ── Fetch current user info from /auth/me ────────────────────────
  const fetchMe = useCallback(async (accessToken) => {
    try {
      const res = await fetch(`${BACKEND_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Session expired");
      const data = await res.json();
      setUser(data.user);
    } catch {
      // Token is invalid/expired — clear session
      if (typeof window !== "undefined") {
        localStorage.removeItem("auth_token");
      }
      setToken(null);
      setUser(null);
    }
  }, []);

  // ── Restore session on mount ─────────────────────────────────────
  useEffect(() => {
    queueMicrotask(async () => {
      const savedToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      if (savedToken) {
        setToken(savedToken);
        try {
          await fetchMe(savedToken);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });
  }, [fetchMe]);

  // ── Login ────────────────────────────────────────────────────────
  const login = useCallback(async (identifierOrPayload, maybePassword, maybeRole) => {
    let payload = {};

    if (typeof identifierOrPayload === "object" && identifierOrPayload !== null) {
      payload = identifierOrPayload;
    } else {
      const identifier = String(identifierOrPayload || "").trim();
      const password = maybePassword;
      const role = maybeRole || "student";

      if (role === "admin") {
        payload = { admin_id: identifier, password, role: "admin" };
      } else if (role === "student") {
        payload = { roll_number: identifier, password, role: "student" };
      } else if (identifier.includes("@")) {
        payload = { email: identifier, password };
      } else {
        payload = { roll_number: identifier, password, role: "student" };
      }
    }

    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Login failed");

    const accessToken = data.session?.access_token;
    if (accessToken && typeof window !== "undefined") {
      localStorage.setItem("auth_token", accessToken);
      setToken(accessToken);
    }

    if (data.user) {
      setUser({
        ...data.user,
        is_admin: data.user.is_admin ?? data.user.role === "admin",
      });
    }

    // Refresh claims in background if token exists
    if (accessToken) {
      await fetchMe(accessToken);
    }

    return data;
  }, [fetchMe]);

  // ── Set Session (e.g. after first-time activation) ───────────────
  const setSession = useCallback((session, userData) => {
    if (session?.access_token && typeof window !== "undefined") {
      localStorage.setItem("auth_token", session.access_token);
      setToken(session.access_token);
    }
    if (userData) {
      setUser({
        ...userData,
        is_admin: userData.is_admin ?? userData.role === "admin",
      });
    }
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
  }, [fetchMe]);

  // ── Logout ───────────────────────────────────────────────────────
  const logout = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
    }
    setToken(null);
    setUser(null);
  }, []);

  // ── Refresh user info ─────────────────────────────────────────────
  const refreshUser = useCallback(async () => {
    const activeToken = token || (typeof window !== "undefined" ? localStorage.getItem("auth_token") : null);
    if (activeToken) {
      await fetchMe(activeToken);
    }
  }, [token, fetchMe]);

  const value = {
    user,
    token,
    loading,
    isLoggedIn: !!user,
    isAdmin: user?.is_admin || false,
    login,
    setSession,
    signup,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

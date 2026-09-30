/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import {
  ShieldAlert,
  UserPlus,
  Users,
  ClipboardList,
  Loader2,
  ShieldX,
  Search,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Trash2,
  Edit2,
  X,
  Filter,
  AlertTriangle,
  KeyRound,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  Clock,
  Sparkles,
} from "lucide-react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

export default function AdminPage() {
  const { user, token, isLoggedIn, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  // Active view tab: "manage_students" | "add_student" | "attendance_logs"
  const [activeTab, setActiveTab] = useState("manage_students");

  // Student management states
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");

  // Add student form
  const [addForm, setAddForm] = useState({ name: "", roll_number: "", department: "" });
  const [addLoading, setAddLoading] = useState(false);
  const [addSuccess, setAddSuccess] = useState(null);

  // Inline edit state
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: "", roll_number: "", department: "" });
  const [editError, setEditError] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  // Action status (delete / reset voice)
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [feedbackMsg, setFeedbackMsg] = useState(null); // { type: 'success' | 'error', text: '' }

  // Set Password modal states (Task 3)
  const [passwordStudent, setPasswordStudent] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState(null);

  // Generate activation modal states (Task 4)
  const [activationModalData, setActivationModalData] = useState(null); // { student, code, expiresAt }
  const [activationLoadingId, setActivationLoadingId] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Add student result activation info (Task 5)
  const [newStudentActivation, setNewStudentActivation] = useState(null); // { student, code, expiresAt }
  const [copiedNewCode, setCopiedNewCode] = useState(false);

  // Attendance logs states
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilterStudentId, setLogFilterStudentId] = useState("");
  const [logFilterDate, setLogFilterDate] = useState("");
  const [logFilterStatus, setLogFilterStatus] = useState("");
  const [logFilterSearch, setLogFilterSearch] = useState("");

  // ── Auth Protection ───────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;

    if (!isLoggedIn) {
      router.push("/login");
      return;
    }

    if (!isAdmin) {
      const timer = setTimeout(() => router.push("/"), 2000);
      return () => clearTimeout(timer);
    }
  }, [authLoading, isLoggedIn, isAdmin, router]);

  // ── Fetch Students ────────────────────────────────────────────────
  const fetchStudents = useCallback(async () => {
    if (!token) return;
    setStudentsLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/admin/students`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load students");
      setStudents(data.students || []);
    } catch (err) {
      setFeedbackMsg({ type: "error", text: err.message });
    } finally {
      setStudentsLoading(false);
    }
  }, [token]);

  // ── Fetch Attendance Logs ─────────────────────────────────────────
  const fetchAttendanceLogs = useCallback(async () => {
    if (!token) return;
    setLogsLoading(true);
    try {
      const params = new URLSearchParams();
      if (logFilterStudentId.trim()) params.append("student_id", logFilterStudentId.trim());
      if (logFilterDate.trim()) params.append("date", logFilterDate.trim());
      if (logFilterStatus.trim()) params.append("status", logFilterStatus.trim());

      const res = await fetch(`${BACKEND_URL}/admin/attendance?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch attendance logs");
      setLogs(Array.isArray(data) ? data : (data.records || []));
    } catch (err) {
      setFeedbackMsg({ type: "error", text: err.message });
    } finally {
      setLogsLoading(false);
    }
  }, [token, logFilterStudentId, logFilterDate, logFilterStatus]);

  useEffect(() => {
    if (isAdmin && token) {
      if (activeTab === "manage_students") {
        fetchStudents();
      } else if (activeTab === "attendance_logs") {
        fetchAttendanceLogs();
      }
    }
  }, [isAdmin, token, activeTab, fetchStudents, fetchAttendanceLogs]);

  // ── Add Student ───────────────────────────────────────────────────
  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.roll_number.trim()) return;

    setAddLoading(true);
    setFeedbackMsg(null);
    setAddSuccess(null);
    setNewStudentActivation(null);
    setCopiedNewCode(false);

    try {
      const res = await fetch(`${BACKEND_URL}/admin/students`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(addForm),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to add student");

      setAddSuccess(`Student "${data.student.name}" (Roll: ${data.student.roll_number}) added successfully!`);
      if (data.activation_code) {
        setNewStudentActivation({
          student: data.student,
          code: data.activation_code,
          expiresAt: data.expires_at,
        });
      }
      setAddForm({ name: "", roll_number: "", department: "" });
      fetchStudents();
    } catch (err) {
      setFeedbackMsg({ type: "error", text: err.message });
    } finally {
      setAddLoading(false);
    }
  };

  // ── Inline Edit Student ───────────────────────────────────────────
  const startEdit = (student) => {
    setEditingStudentId(student.id);
    setEditFormData({
      name: student.name || "",
      roll_number: student.roll_number || "",
      department: student.department || "",
    });
    setEditError(null);
  };

  const handleCancelEdit = () => {
    setEditingStudentId(null);
    setEditError(null);
  };

  const handleSaveEdit = async (student) => {
    setEditError(null);

    const trimmedName = editFormData.name.trim();
    const trimmedRoll = editFormData.roll_number.trim();
    const trimmedDept = editFormData.department.trim();

    // Validation
    // name: 1–100 characters
    if (trimmedName.length < 1 || trimmedName.length > 100) {
      setEditError("Name must be between 1 and 100 characters.");
      return;
    }
    // roll number: 1–50 characters
    if (trimmedRoll.length < 1 || trimmedRoll.length > 50) {
      setEditError("Roll number must be between 1 and 50 characters.");
      return;
    }
    // department: 0–100 characters
    if (trimmedDept.length > 100) {
      setEditError("Department must be between 0 and 100 characters.");
      return;
    }

    // Only send changed fields
    const updates = {};
    if (trimmedName !== (student.name || "")) {
      updates.name = trimmedName;
    }
    if (trimmedRoll !== (student.roll_number || "")) {
      updates.roll_number = trimmedRoll;
    }
    if (trimmedDept !== (student.department || "")) {
      updates.department = trimmedDept;
    }

    // If nothing changed, just close edit mode
    if (Object.keys(updates).length === 0) {
      setEditingStudentId(null);
      return;
    }

    setEditLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/admin/students/${student.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 || /duplicate|already exists|already taken/i.test(data.message || "")) {
          throw new Error("This roll number is already taken.");
        }
        throw new Error(data.message || "Failed to update student");
      }

      // On success: update row, close edit form
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, ...data } : s))
      );
      setEditingStudentId(null);
      setFeedbackMsg({
        type: "success",
        text: "Student details updated successfully.",
      });
    } catch (err) {
      // Keep entered values on validation/API failure
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  // ── Reset Voice Embedding ─────────────────────────────────────────
  const handleResetVoice = async (student) => {
    if (typeof window !== "undefined" && window.confirm) {
      const confirmed = window.confirm(
        `Are you sure you want to reset voice data for "${student.name}"? They will need to re-enroll their voice.`
      );
      if (!confirmed) return;
    }

    setActionLoadingId(student.id);
    setFeedbackMsg(null);

    try {
      const res = await fetch(`${BACKEND_URL}/admin/students/${student.id}/reset-voice`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to reset voice data");

      // After successful reset: update voice enrolled state to No
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, voice_enrolled: false } : s))
      );
      setFeedbackMsg({
        type: "success",
        text: `Voice data cleared for ${student.name}. Status updated to not enrolled.`,
      });
    } catch (err) {
      // Preserve row state when an operation fails
      setFeedbackMsg({ type: "error", text: err.message });
    } finally {
      setActionLoadingId(null);
    }
  };

  // ── Delete Student ────────────────────────────────────────────────
  const handleDeleteStudent = async (student) => {
    if (typeof window !== "undefined" && window.confirm) {
      const confirmed = window.confirm(
        `Warning: Are you sure you want to remove student "${student.name}"? This action cannot be undone.`
      );
      if (!confirmed) return;
    }

    setActionLoadingId(student.id);
    setFeedbackMsg(null);

    try {
      const res = await fetch(`${BACKEND_URL}/admin/students/${student.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to remove student");

      // After successful deletion: remove the student from the displayed list
      setStudents((prev) => prev.filter((s) => s.id !== student.id));
      setFeedbackMsg({
        type: "success",
        text: `Student "${student.name}" removed from the system.`,
      });
    } catch (err) {
      // Preserve row state when an operation fails
      setFeedbackMsg({ type: "error", text: err.message });
    } finally {
      setActionLoadingId(null);
    }
  };

  // ── Set Password Modal Handlers ────────────────────────────────────
  const handleOpenSetPassword = (student) => {
    setPasswordStudent(student);
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setPasswordError(null);
  };

  const handleCloseSetPassword = () => {
    setPasswordStudent(null);
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setPasswordError(null);
  };

  const handleSetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!passwordStudent) return;
    setPasswordError(null);

    if (!newPassword || !confirmPassword) {
      setPasswordError("Both new password and confirmation are required.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters long.");
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError("Password must contain at least one letter and one number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/admin/students/${passwordStudent.id}/set-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to update password.");
      }

      const studentName = passwordStudent.name;
      handleCloseSetPassword();
      setFeedbackMsg({
        type: "success",
        text: `Password successfully updated for ${studentName}.`,
      });
    } catch (err) {
      setPasswordError(err.message || "Failed to update student password.");
    } finally {
      setPasswordLoading(false);
    }
  };

  // ── Generate Activation Code Handler ───────────────────────────────
  const handleGenerateActivation = async (student) => {
    setActivationLoadingId(student.id);
    setCopiedCode(false);
    try {
      const res = await fetch(`${BACKEND_URL}/admin/students/${student.id}/generate-activation`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to generate activation code.");
      }

      setActivationModalData({
        student: data.student || student,
        code: data.activation_code,
        expiresAt: data.expires_at,
      });
      setFeedbackMsg({
        type: "success",
        text: `Activation code generated for ${student.name}.`,
      });
    } catch (err) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "Failed to generate activation code.",
      });
    } finally {
      setActivationLoadingId(null);
    }
  };

  // Filter students by search
  const filteredStudents = students.filter((s) => {
    const q = studentSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      s.name?.toLowerCase().includes(q) ||
      s.roll_number?.toLowerCase().includes(q) ||
      s.department?.toLowerCase().includes(q)
    );
  });

  // Filter attendance logs by search
  const filteredLogs = logs.filter((l) => {
    const q = logFilterSearch.toLowerCase().trim();
    if (!q) return true;
    const roll = l.roll_number || l.student_roll || "";
    return (
      l.student_name?.toLowerCase().includes(q) ||
      roll.toLowerCase().includes(q)
    );
  });

  // ── Auth Loading ──────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  // ── Unauthorized ──────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center">
        <div className="bg-rose-50 rounded-full p-4 w-fit mx-auto mb-4">
          <ShieldX className="w-8 h-8 text-rose-500" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h1>
        <p className="text-slate-500 text-sm">
          You don&apos;t have admin privileges to access this area.
          <br />
          Redirecting to dashboard...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto mt-2 pb-16">
      {/* ── Page Title ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="bg-rose-50 rounded-lg p-2">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin Control Panel</h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Logged in as <span className="font-semibold text-slate-700">{user?.email}</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Feedback Banner ───────────────────────────────────────── */}
      {feedbackMsg && (
        <div
          className={`my-4 p-4 rounded-xl flex items-center justify-between text-sm ${
            feedbackMsg.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Action Navigation Cards ───────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
        <button
          onClick={() => setActiveTab("manage_students")}
          className={`bg-white rounded-xl border p-5 text-left transition-all group ${
            activeTab === "manage_students"
              ? "border-indigo-600 shadow-md ring-2 ring-indigo-500/20"
              : "border-slate-200 hover:border-indigo-300 hover:shadow-xs"
          }`}
        >
          <div className="bg-indigo-50 rounded-lg p-2.5 w-fit mb-3 group-hover:scale-105 transition-transform">
            <Users className="w-5 h-5 text-indigo-600" />
          </div>
          <h3 className="font-semibold text-slate-900 text-sm">Manage Students</h3>
          <p className="text-xs text-slate-500 mt-1">
            Edit details, reset voice profiles, or delete registered students
          </p>
        </button>

        <button
          onClick={() => setActiveTab("add_student")}
          className={`bg-white rounded-xl border p-5 text-left transition-all group ${
            activeTab === "add_student"
              ? "border-emerald-600 shadow-md ring-2 ring-emerald-500/20"
              : "border-slate-200 hover:border-emerald-300 hover:shadow-xs"
          }`}
        >
          <div className="bg-emerald-50 rounded-lg p-2.5 w-fit mb-3 group-hover:scale-105 transition-transform">
            <UserPlus className="w-5 h-5 text-emerald-600" />
          </div>
          <h3 className="font-semibold text-slate-900 text-sm">Add Student</h3>
          <p className="text-xs text-slate-500 mt-1">
            Register new student credentials to enable voice enrollment
          </p>
        </button>

        <button
          onClick={() => setActiveTab("attendance_logs")}
          className={`bg-white rounded-xl border p-5 text-left transition-all group ${
            activeTab === "attendance_logs"
              ? "border-amber-600 shadow-md ring-2 ring-amber-500/20"
              : "border-slate-200 hover:border-amber-300 hover:shadow-xs"
          }`}
        >
          <div className="bg-amber-50 rounded-lg p-2.5 w-fit mb-3 group-hover:scale-105 transition-transform">
            <ClipboardList className="w-5 h-5 text-amber-600" />
          </div>
          <h3 className="font-semibold text-slate-900 text-sm">Attendance Logs</h3>
          <p className="text-xs text-slate-500 mt-1">
            View verification history with date, student, and status filters
          </p>
        </button>
      </div>

      {/* ── TAB 1: MANAGE STUDENTS ────────────────────────────────── */}
      {activeTab === "manage_students" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Enrolled Students</h2>
              <p className="text-xs text-slate-400">Total: {students.length} students</p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Filter by name, roll, dept..."
                className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {studentsLoading ? (
            <div className="py-16 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Loading student directory...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                      Name
                    </th>
                    <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                      Roll Number
                    </th>
                    <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                      Department
                    </th>
                    <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                      Voice Enrolled
                    </th>
                    <th className="text-right px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.length > 0 ? (
                    filteredStudents.map((s) => {
                      const isEditing = editingStudentId === s.id;

                      if (isEditing) {
                        return (
                          <tr
                            key={s.id}
                            className="bg-indigo-50/40 border-b border-indigo-100"
                            data-testid={`inline-edit-row-${s.id}`}
                          >
                            <td className="px-5 py-3 align-top">
                              <input
                                type="text"
                                aria-label="Name"
                                placeholder="Name"
                                value={editFormData.name}
                                onChange={(e) =>
                                  setEditFormData({ ...editFormData, name: e.target.value })
                                }
                                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-900"
                              />
                              {editError && (
                                <div
                                  className="text-[11px] text-rose-600 font-semibold mt-1"
                                  role="alert"
                                >
                                  {editError}
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-3 align-top">
                              <input
                                type="text"
                                aria-label="Roll Number"
                                placeholder="Roll Number"
                                value={editFormData.roll_number}
                                onChange={(e) =>
                                  setEditFormData({ ...editFormData, roll_number: e.target.value })
                                }
                                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-mono text-slate-900"
                              />
                            </td>
                            <td className="px-5 py-3 align-top">
                              <input
                                type="text"
                                aria-label="Department"
                                placeholder="Department"
                                value={editFormData.department}
                                onChange={(e) =>
                                  setEditFormData({ ...editFormData, department: e.target.value })
                                }
                                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-900"
                              />
                            </td>
                            <td className="px-5 py-3 align-middle text-xs font-semibold text-slate-600">
                              {s.voice_enrolled ? "Yes" : "No"}
                            </td>
                            <td className="px-5 py-3 align-middle text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(s)}
                                  disabled={editLoading}
                                  aria-label="Save"
                                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                                >
                                  {editLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  disabled={editLoading}
                                  aria-label="Cancel"
                                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-slate-900">{s.name}</td>
                          <td className="px-5 py-3.5 text-slate-600 font-mono text-xs">
                            {s.roll_number}
                          </td>
                          <td className="px-5 py-3.5 text-slate-500 text-xs">
                            {s.department || "—"}
                          </td>
                          <td className="px-5 py-3.5">
                            {s.voice_enrolled ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                Yes
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                <XCircle className="w-3 h-3" />
                                No
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => startEdit(s)}
                                title="Edit Details"
                                aria-label={`Edit ${s.name}`}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenSetPassword(s)}
                                disabled={actionLoadingId === s.id || activationLoadingId === s.id}
                                title="Set Password"
                                aria-label={`Set Password for ${s.name}`}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleGenerateActivation(s)}
                                disabled={actionLoadingId === s.id || activationLoadingId === s.id}
                                title="Generate Activation Code"
                                aria-label={`Generate Activation Code for ${s.name}`}
                                className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                              >
                                {activationLoadingId === s.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                                ) : (
                                  <Key className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={() => handleResetVoice(s)}
                                disabled={actionLoadingId === s.id}
                                title="Reset Voice Embedding"
                                aria-label={`Reset Voice for ${s.name}`}
                                className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteStudent(s)}
                                disabled={actionLoadingId === s.id}
                                title="Delete Student"
                                aria-label={`Delete ${s.name}`}
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-slate-400 italic">
                        {studentSearch ? "No students matching search filter." : "No students registered yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: ADD STUDENT ────────────────────────────────────── */}
      {activeTab === "add_student" && (
        <div className="max-w-xl mx-auto bg-white rounded-xl border border-slate-200 p-8 shadow-xs">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-50 rounded-lg p-2.5">
              <UserPlus className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Register New Student</h2>
              <p className="text-xs text-slate-500">
                Adds a student record so they can complete voice enrollment.
              </p>
            </div>
          </div>

          {addSuccess && !newStudentActivation && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between">
              <span>{addSuccess}</span>
              <button
                onClick={() => setAddSuccess(null)}
                className="text-emerald-600 hover:text-emerald-900 text-xs font-semibold underline ml-3"
              >
                Dismiss
              </button>
            </div>
          )}

          {newStudentActivation && (
            <div className="mb-6 p-5 rounded-xl bg-emerald-50 border border-emerald-200 text-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                  <Sparkles className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>Student Added &amp; Activation Code Generated</span>
                </div>
                <button
                  onClick={() => setNewStudentActivation(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                  aria-label="Close activation details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-600 mt-2">
                Student <strong className="text-slate-900">{newStudentActivation.student?.name}</strong> (Roll: {newStudentActivation.student?.roll_number}) is registered. Give this single-use activation code to the student to activate their account and set their password.
              </p>

              <div className="my-3 p-3 bg-white rounded-lg border border-emerald-300 flex items-center justify-between gap-3 shadow-xs">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Activation Code
                  </div>
                  <div className="font-mono text-xl font-bold tracking-widest text-emerald-700 select-all">
                    {newStudentActivation.code}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.clipboard) {
                      navigator.clipboard.writeText(newStudentActivation.code);
                      setCopiedNewCode(true);
                      setTimeout(() => setCopiedNewCode(false), 2500);
                    }
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  {copiedNewCode ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy Code
                    </>
                  )}
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500 pt-1 border-t border-emerald-100">
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Expires: {new Date(newStudentActivation.expiresAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-emerald-700 font-medium">
                  First-time activation page: <span className="font-mono font-semibold">/activate</span>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleAddStudent} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder="e.g. John Doe"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Roll Number *
              </label>
              <input
                type="text"
                required
                value={addForm.roll_number}
                onChange={(e) => setAddForm({ ...addForm, roll_number: e.target.value })}
                placeholder="e.g. 21 or CS2026-042"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Department / Program
              </label>
              <input
                type="text"
                value={addForm.department}
                onChange={(e) => setAddForm({ ...addForm, department: e.target.value })}
                placeholder="e.g. Computer Science & Engineering"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={addLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 mt-6"
            >
              {addLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving Student...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Register Student
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* ── TAB 3: ATTENDANCE LOGS ─────────────────────────────────── */}
      {activeTab === "attendance_logs" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Attendance Verification Logs</h2>
              <p className="text-xs text-slate-400">Showing {filteredLogs.length} records</p>
            </div>

            {/* Filter toolbar */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="relative">
                <input
                  type="text"
                  aria-label="Student ID Filter"
                  placeholder="Student ID..."
                  value={logFilterStudentId}
                  onChange={(e) => setLogFilterStudentId(e.target.value)}
                  className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 w-32 font-mono"
                />
              </div>

              {students.length > 0 && (
                <select
                  aria-label="Filter by Student"
                  value={logFilterStudentId}
                  onChange={(e) => setLogFilterStudentId(e.target.value)}
                  className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 max-w-[150px]"
                >
                  <option value="">All Students</option>
                  {students.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.roll_number})
                    </option>
                  ))}
                </select>
              )}

              <div className="relative">
                <input
                  type="date"
                  aria-label="Date Filter"
                  value={logFilterDate}
                  onChange={(e) => setLogFilterDate(e.target.value)}
                  className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  title="Date"
                />
              </div>

              <select
                aria-label="Status Filter"
                value={logFilterStatus}
                onChange={(e) => setLogFilterStatus(e.target.value)}
                className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="">All Statuses</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={logFilterSearch}
                  onChange={(e) => setLogFilterSearch(e.target.value)}
                  placeholder="Filter name/roll..."
                  className="text-xs pl-8 pr-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 w-32"
                />
              </div>

              <button
                type="button"
                onClick={fetchAttendanceLogs}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
              >
                <Filter className="w-3 h-3" />
                Filter
              </button>

              {(logFilterStudentId || logFilterDate || logFilterStatus) && (
                <button
                  type="button"
                  onClick={() => {
                    setLogFilterStudentId("");
                    setLogFilterDate("");
                    setLogFilterStatus("");
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 underline px-1"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {logsLoading ? (
            <div className="py-16 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-amber-600 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Loading attendance logs...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                      Student Name
                    </th>
                    <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                      Roll Number
                    </th>
                    <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                      Date
                    </th>
                    <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                      Time
                    </th>
                    <th className="text-left px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-right px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                      Verification Score
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.length > 0 ? (
                    filteredLogs.map((log) => {
                      let logTime = "—";
                      if (log.time) {
                        try {
                          const parsed = new Date(log.time);
                          if (!isNaN(parsed.getTime())) {
                            logTime = parsed.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            });
                          } else {
                            logTime = log.time;
                          }
                        } catch {
                          logTime = log.time;
                        }
                      }

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-slate-900">
                            {log.student_name}
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 font-mono text-xs">
                            {log.roll_number || log.student_roll || "—"}
                          </td>
                          <td className="px-5 py-3.5 text-slate-700 text-xs">{log.date}</td>
                          <td className="px-5 py-3.5 text-slate-500 text-xs">{logTime}</td>
                          <td className="px-5 py-3.5">
                            {log.status === "present" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                Present
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                <XCircle className="w-3 h-3" />
                                Absent
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right font-medium text-xs text-slate-700">
                            {log.verification_score !== null &&
                            log.verification_score !== undefined
                              ? `${Math.round(log.verification_score * 100)}%`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-slate-400 italic">
                        No attendance records match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Set Password Modal ────────────────────────────────────── */}
      {passwordStudent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="set-password-title"
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="set-password-title" className="text-base font-bold text-slate-900">
                    Set Student Password
                  </h3>
                  <p className="text-xs text-slate-500">
                    {passwordStudent.name} ({passwordStudent.roll_number})
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseSetPassword}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
              Enter a new password for this student. Changing the password does not affect voice enrollment or attendance records. The student&apos;s previous password is never displayed.
            </p>

            {passwordError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2" role="alert">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            <form onSubmit={handleSetPasswordSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password *
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 chars, letters & numbers"
                    autoComplete="new-password"
                    className="w-full text-xs px-3 py-2 pr-9 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm New Password *
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                    className="w-full text-xs px-3 py-2 pr-9 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={handleCloseSetPassword}
                  disabled={passwordLoading}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  {passwordLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                    </>
                  ) : (
                    "Set Password"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Activation Code Modal ─────────────────────────────────── */}
      {activationModalData && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="activation-modal-title"
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="activation-modal-title" className="text-base font-bold text-slate-900">
                    New Activation Code
                  </h3>
                  <p className="text-xs text-slate-500">
                    For {activationModalData.student?.name} ({activationModalData.student?.roll_number})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActivationModalData(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              Share this single-use activation code with the student. They will use it on the{" "}
              <span className="font-semibold text-slate-800">/activate</span> page to set their password and activate their account.
            </p>

            <div className="my-4 p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Activation Code
                </div>
                <div className="font-mono text-2xl font-bold tracking-widest text-indigo-600 select-all">
                  {activationModalData.code}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    navigator.clipboard.writeText(activationModalData.code);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2500);
                  }
                }}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy Code
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-5">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                Expires on: {new Date(activationModalData.expiresAt).toLocaleString()}
              </span>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setActivationModalData(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

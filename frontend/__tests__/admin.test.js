/**
 * Tests for Admin Page – TASK 10
 *
 * Covers:
 * - Student list rendering (GET /admin/students)
 * - Delete student (DELETE /admin/students/:id, row removal, error handling)
 * - Reset voice (POST /admin/students/:id/reset-voice, state updated to No, error handling)
 * - Inline edit:
 *   - Clicking Edit opens inline inputs
 *   - Field validation (name 1-100, roll 1-50, dept 0-100)
 *   - Keeps entered values on validation / API failure
 *   - Only sends changed fields to PUT /admin/students/:id
 *   - Success updates the row and closes edit form
 *   - Duplicate roll number shows "This roll number is already taken."
 * - Attendance logs:
 *   - Rendering logs with Student Name, Roll Number, Date, Time, Status, Verification Score
 *   - student_id filter
 *   - date filter
 *   - Combined student_id and date filter
 */

import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// ── Mock lucide-react icons ────────────────────────────────────────
jest.mock("lucide-react", () => {
  const stub = (name) => {
    const Component = (props) => <span data-testid={`icon-${name}`} {...props} />;
    Component.displayName = name;
    return Component;
  };
  return {
    ShieldAlert: stub("ShieldAlert"),
    UserPlus: stub("UserPlus"),
    Users: stub("Users"),
    ClipboardList: stub("ClipboardList"),
    Loader2: stub("Loader2"),
    ShieldX: stub("ShieldX"),
    Search: stub("Search"),
    CheckCircle2: stub("CheckCircle2"),
    XCircle: stub("XCircle"),
    RotateCcw: stub("RotateCcw"),
    Trash2: stub("Trash2"),
    Edit2: stub("Edit2"),
    X: stub("X"),
    Filter: stub("Filter"),
    AlertTriangle: stub("AlertTriangle"),
    KeyRound: stub("KeyRound"),
    Key: stub("Key"),
    Copy: stub("Copy"),
    Check: stub("Check"),
    Eye: stub("Eye"),
    EyeOff: stub("EyeOff"),
    Clock: stub("Clock"),
    Sparkles: stub("Sparkles"),
  };
});

// ── Mock next/navigation ───────────────────────────────────────────
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// ── Mock AuthContext ───────────────────────────────────────────────
const mockUseAuth = jest.fn();
jest.mock("../app/context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockStudents = [
  {
    id: "student-1",
    name: "Alice Cooper",
    roll_number: "CS101",
    department: "Computer Science",
    voice_enrolled: true,
  },
  {
    id: "student-2",
    name: "Bob Marley",
    roll_number: "CS102",
    department: "Information Technology",
    voice_enrolled: false,
  },
];

const mockAttendanceLogs = [
  {
    id: "log-1",
    student_id: "student-1",
    student_name: "Alice Cooper",
    roll_number: "CS101",
    date: "2026-09-25",
    time: "2026-09-25T10:00:00Z",
    status: "present",
    verification_score: 0.94,
  },
  {
    id: "log-2",
    student_id: "student-2",
    student_name: "Bob Marley",
    roll_number: "CS102",
    date: "2026-09-24",
    time: "2026-09-24T10:15:00Z",
    status: "absent",
    verification_score: null,
  },
];

let AdminPage;
beforeAll(async () => {
  const mod = await import("../app/admin/page");
  AdminPage = mod.default;
});

beforeEach(() => {
  jest.clearAllMocks();
  window.confirm = jest.fn(() => true);

  mockUseAuth.mockReturnValue({
    user: { email: "admin@test.com" },
    token: "mock-admin-token",
    isLoggedIn: true,
    isAdmin: true,
    loading: false,
  });
});

describe("TASK 10: Admin Page Integration", () => {
  // ── 1. Student List Rendering ──────────────────────────────────
  test("renders student list with Name, Roll Number, Department, and Voice Enrolled status", async () => {
    global.fetch = jest.fn().mockImplementation((url, opts) => {
      const method = opts?.method ? opts.method.toUpperCase() : "GET";
      if (url.includes("/admin/students") && method === "GET") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: "ok", students: mockStudents }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(<AdminPage />);

    expect(screen.getByText(/loading student directory/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Alice Cooper")).toBeInTheDocument();
      expect(screen.getByText("CS101")).toBeInTheDocument();
      expect(screen.getByText("Computer Science")).toBeInTheDocument();

      expect(screen.getByText("Bob Marley")).toBeInTheDocument();
      expect(screen.getByText("CS102")).toBeInTheDocument();
      expect(screen.getByText("Information Technology")).toBeInTheDocument();
    });

    // Voice Enrolled display: Alice is true ("Yes"), Bob is false ("No")
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();

    // Verify Action buttons exist
    expect(screen.getByLabelText("Edit Alice Cooper")).toBeInTheDocument();
    expect(screen.getByLabelText("Reset Voice for Alice Cooper")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete Alice Cooper")).toBeInTheDocument();
  });

  // ── 2. Delete Student ──────────────────────────────────────────
  test("removes student from displayed list after successful deletion", async () => {
    global.fetch = jest.fn().mockImplementation((url, opts) => {
      const method = opts?.method ? opts.method.toUpperCase() : "GET";
      if (url.endsWith("/admin/students") && method === "GET") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: "ok", students: [...mockStudents] }),
        });
      }
      if (url.includes("/admin/students/student-1") && method === "DELETE") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: "ok", message: "Student removed" }),
        });
      }
      return Promise.reject(new Error(`Unhandled: ${url}`));
    });

    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Cooper")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Delete Alice Cooper"));

    await waitFor(() => {
      expect(screen.queryByText("Alice Cooper")).not.toBeInTheDocument();
      expect(screen.getByText("Bob Marley")).toBeInTheDocument();
    });

    expect(screen.getByText(/Student "Alice Cooper" removed from the system/i)).toBeInTheDocument();
  });

  test("preserves student in list when delete fails", async () => {
    global.fetch = jest.fn().mockImplementation((url, opts) => {
      const method = opts?.method ? opts.method.toUpperCase() : "GET";
      if (url.endsWith("/admin/students") && method === "GET") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: "ok", students: [...mockStudents] }),
        });
      }
      if (url.includes("/admin/students/student-1") && method === "DELETE") {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ status: "error", message: "Database deletion failed" }),
        });
      }
      return Promise.reject(new Error(`Unhandled: ${url}`));
    });

    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Cooper")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Delete Alice Cooper"));

    await waitFor(() => {
      expect(screen.getByText("Alice Cooper")).toBeInTheDocument();
      expect(screen.getByText("Database deletion failed")).toBeInTheDocument();
    });
  });

  // ── 3. Reset Voice ─────────────────────────────────────────────
  test("updates voice enrolled state to No after successful reset", async () => {
    global.fetch = jest.fn().mockImplementation((url, opts) => {
      const method = opts?.method ? opts.method.toUpperCase() : "GET";
      if (url.endsWith("/admin/students") && method === "GET") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: "ok", students: [...mockStudents] }),
        });
      }
      if (url.includes("/admin/students/student-1/reset-voice") && method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: "ok", message: "Voice data reset successfully" }),
        });
      }
      return Promise.reject(new Error(`Unhandled: ${url}`));
    });

    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Cooper")).toBeInTheDocument();
    });

    // Before reset, Alice has enrolled="Yes"
    expect(screen.getByText("Yes")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Reset Voice for Alice Cooper"));

    await waitFor(() => {
      // Voice enrolled for Alice updated to No. Now both students have "No".
      const noBadges = screen.getAllByText("No");
      expect(noBadges.length).toBe(2);
      expect(screen.queryByText("Yes")).not.toBeInTheDocument();
    });

    expect(screen.getByText(/Voice data cleared for Alice Cooper/i)).toBeInTheDocument();
  });

  test("preserves voice enrolled state when reset fails", async () => {
    global.fetch = jest.fn().mockImplementation((url, opts) => {
      const method = opts?.method ? opts.method.toUpperCase() : "GET";
      if (url.endsWith("/admin/students") && method === "GET") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: "ok", students: [...mockStudents] }),
        });
      }
      if (url.includes("/admin/students/student-1/reset-voice") && method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ status: "error", message: "Reset failed on server" }),
        });
      }
      return Promise.reject(new Error(`Unhandled: ${url}`));
    });

    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Cooper")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Reset Voice for Alice Cooper"));

    await waitFor(() => {
      expect(screen.getByText("Yes")).toBeInTheDocument();
      expect(screen.getByText("Reset failed on server")).toBeInTheDocument();
    });
  });

  // ── 4. Inline Edit ─────────────────────────────────────────────
  test("opens inline edit inputs, validates fields, and keeps entered values on validation error", async () => {
    global.fetch = jest.fn().mockImplementation((url, opts) => {
      const method = opts?.method ? opts.method.toUpperCase() : "GET";
      if (url.endsWith("/admin/students") && method === "GET") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: "ok", students: [...mockStudents] }),
        });
      }
      return Promise.reject(new Error(`Unhandled: ${url}`));
    });

    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Cooper")).toBeInTheDocument();
    });

    // Click Edit on Alice Cooper
    fireEvent.click(screen.getByLabelText("Edit Alice Cooper"));

    const inlineRow = screen.getByTestId("inline-edit-row-student-1");
    expect(inlineRow).toBeInTheDocument();

    const nameInput = within(inlineRow).getByPlaceholderText("Name");
    const rollInput = within(inlineRow).getByPlaceholderText("Roll Number");
    const saveBtn = within(inlineRow).getByRole("button", { name: /save/i });

    expect(nameInput.value).toBe("Alice Cooper");
    expect(rollInput.value).toBe("CS101");

    // Empty name test
    fireEvent.change(nameInput, { target: { value: "   " } });
    fireEvent.click(saveBtn);

    expect(screen.getByText("Name must be between 1 and 100 characters.")).toBeInTheDocument();
    // Kept entered values
    expect(nameInput.value).toBe("   ");

    // Fix name, break roll number (> 50 chars)
    fireEvent.change(nameInput, { target: { value: "Alice New" } });
    fireEvent.change(rollInput, { target: { value: "A".repeat(55) } });
    fireEvent.click(saveBtn);

    expect(screen.getByText("Roll number must be between 1 and 50 characters.")).toBeInTheDocument();
    expect(rollInput.value).toBe("A".repeat(55));
  });

  test("sends only changed fields to PUT /admin/students/:id and updates the row on success", async () => {
    let capturedBody = null;

    global.fetch = jest.fn().mockImplementation((url, opts) => {
      const method = opts?.method ? opts.method.toUpperCase() : "GET";
      if (url.endsWith("/admin/students") && method === "GET") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: "ok", students: [...mockStudents] }),
        });
      }
      if (url.includes("/admin/students/student-1") && method === "PUT") {
        capturedBody = JSON.parse(opts.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: "student-1",
              name: "Alice Cooper Updated",
              roll_number: "CS101",
              department: "Computer Science",
              voice_enrolled: true,
            }),
        });
      }
      return Promise.reject(new Error(`Unhandled: ${url}`));
    });

    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Cooper")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Edit Alice Cooper"));

    const inlineRow = screen.getByTestId("inline-edit-row-student-1");
    const nameInput = within(inlineRow).getByPlaceholderText("Name");
    const saveBtn = within(inlineRow).getByRole("button", { name: /save/i });

    // Only change name
    fireEvent.change(nameInput, { target: { value: "Alice Cooper Updated" } });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      // Row updated and inline edit closed
      expect(screen.getByText("Alice Cooper Updated")).toBeInTheDocument();
      expect(screen.queryByTestId("inline-edit-row-student-1")).not.toBeInTheDocument();
    });

    // Only changed field was sent
    expect(capturedBody).toEqual({ name: "Alice Cooper Updated" });
  });

  test("displays 'This roll number is already taken.' on 409 conflict and keeps entered values", async () => {
    global.fetch = jest.fn().mockImplementation((url, opts) => {
      const method = opts?.method ? opts.method.toUpperCase() : "GET";
      if (url.endsWith("/admin/students") && method === "GET") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: "ok", students: [...mockStudents] }),
        });
      }
      if (url.includes("/admin/students/student-1") && method === "PUT") {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: () =>
            Promise.resolve({
              status: "error",
              message: "A student with this roll number already exists.",
            }),
        });
      }
      return Promise.reject(new Error(`Unhandled: ${url}`));
    });

    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Cooper")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Edit Alice Cooper"));

    const inlineRow = screen.getByTestId("inline-edit-row-student-1");
    const rollInput = within(inlineRow).getByPlaceholderText("Roll Number");
    const saveBtn = within(inlineRow).getByRole("button", { name: /save/i });

    fireEvent.change(rollInput, { target: { value: "CS102" } });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText("This roll number is already taken.")).toBeInTheDocument();
      // Form remains open and entered value is preserved
      expect(within(screen.getByTestId("inline-edit-row-student-1")).getByPlaceholderText("Roll Number").value).toBe("CS102");
    });
  });

  // ── 5. Attendance Logs Filtering ────────────────────────────────
  test("fetches attendance logs and filters by student_id and date", async () => {
    let capturedUrl = "";

    global.fetch = jest.fn().mockImplementation((url, opts) => {
      const method = opts?.method ? opts.method.toUpperCase() : "GET";
      if (url.endsWith("/admin/students") && method === "GET") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: "ok", students: mockStudents }),
        });
      }
      if (url.includes("/admin/attendance") && method === "GET") {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockAttendanceLogs),
        });
      }
      return Promise.reject(new Error(`Unhandled: ${url}`));
    });

    render(<AdminPage />);

    // Click on Attendance Logs tab
    fireEvent.click(screen.getByRole("button", { name: /attendance logs/i }));

    await waitFor(() => {
      expect(screen.getByText("Alice Cooper")).toBeInTheDocument();
      expect(screen.getByText("94%")).toBeInTheDocument();
      expect(screen.getByText("Bob Marley")).toBeInTheDocument();
    });

    // 1. Filter by student_id
    const studentInput = screen.getByLabelText("Student ID Filter");
    fireEvent.change(studentInput, { target: { value: "11111111-1111-4111-8111-111111111111" } });

    // The Apply filter button has exact text "Filter"
    const filterBtn = screen.getByRole("button", { name: /^filter$/i });
    fireEvent.click(filterBtn);

    await waitFor(() => {
      expect(capturedUrl).toContain("student_id=11111111-1111-4111-8111-111111111111");
    });

    // 2. Filter by date as well (combined)
    const dateInput = screen.getByLabelText("Date Filter");
    fireEvent.change(dateInput, { target: { value: "2026-09-25" } });
    fireEvent.click(filterBtn);

    await waitFor(() => {
      expect(capturedUrl).toContain("student_id=11111111-1111-4111-8111-111111111111");
      expect(capturedUrl).toContain("date=2026-09-25");
    });
  });
});

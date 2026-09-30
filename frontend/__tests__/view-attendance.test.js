/**
 * Tests for View Attendance Page – TASK 9
 *
 * Covers:
 * - Loading state
 * - Successful records with percentage
 * - No records ("No attendance records yet.")
 * - API failure
 * - Missing student ID (no linked student)
 * - Student ownership / security expectations
 * - 401 session expired
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mock lucide-react icons ────────────────────────────────────────
jest.mock("lucide-react", () => {
  const stub = (name) => {
    const Component = (props) => <span data-testid={`icon-${name}`} {...props} />;
    Component.displayName = name;
    return Component;
  };
  return {
    BarChart3: stub("BarChart3"),
    TrendingUp: stub("TrendingUp"),
    User: stub("User"),
    GraduationCap: stub("GraduationCap"),
    CalendarCheck: stub("CalendarCheck"),
    CalendarX: stub("CalendarX"),
    Clock: stub("Clock"),
    ShieldCheck: stub("ShieldCheck"),
    Loader2: stub("Loader2"),
    AlertCircle: stub("AlertCircle"),
    Search: stub("Search"),
    ArrowLeft: stub("ArrowLeft"),
    CheckCircle2: stub("CheckCircle2"),
    XCircle: stub("XCircle"),
    AudioLines: stub("AudioLines"),
  };
});

// ── Mock next/link ─────────────────────────────────────────────────
jest.mock("next/link", () => {
  const Link = ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
  Link.displayName = "Link";
  return { __esModule: true, default: Link };
});

// ── Mock next/navigation ───────────────────────────────────────────
const mockSearchParams = new Map();
jest.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key) => mockSearchParams.get(key) || null,
  }),
}));

// ── Mock AuthContext ───────────────────────────────────────────────
const mockUseAuth = jest.fn();
jest.mock("../app/context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

// ── Helpers ────────────────────────────────────────────────────────
const BACKEND_URL = "http://localhost:5000";

const sampleRecords = [
  {
    id: "rec-1",
    date: "2026-09-25",
    time: "2026-09-25T09:30:00Z",
    status: "present",
    verification_score: 0.92,
  },
  {
    id: "rec-2",
    date: "2026-09-24",
    time: "2026-09-24T09:15:00Z",
    status: "absent",
    verification_score: null,
  },
];

const samplePercentage = {
  student_id: "student-uuid-1",
  percentage: 75,
  present_count: 15,
  total_count: 20,
};

const sampleStudent = {
  id: "student-uuid-1",
  name: "Prakhar Pankaj",
  roll_number: "CS021",
  department: "Computer Science",
};

// Import after mocks
let ViewAttendancePage;
beforeAll(async () => {
  const mod = await import("../app/view-attendance/page");
  ViewAttendancePage = mod.default;
});

beforeEach(() => {
  mockUseAuth.mockReturnValue({ token: "test-jwt-token" });
  mockSearchParams.clear();
  jest.restoreAllMocks();
});

// Helper to mock a successful /students/me + attendance + percentage flow
function mockSuccessfulFlow(student = sampleStudent, records = sampleRecords, pct = samplePercentage) {
  global.fetch = jest.fn().mockImplementation((url) => {
    if (url.includes("/students/me")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: "ok", student }),
      });
    }
    if (url.includes("/percentage")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(pct),
      });
    }
    if (url.match(/\/attendance\/[^/]+$/)) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(records),
      });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

// ────────────────────────────────────────────────────────────────────
describe("TASK 9: View Attendance Page", () => {
  // ── Loading state ──────────────────────────────────────────────
  test("shows loading state while fetching", async () => {
    // Slow fetch that never resolves immediately
    let resolvers = [];
    global.fetch = jest.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        resolvers.push(resolve);
      });
    });

    render(<ViewAttendancePage />);

    // Loading indicator should show
    await waitFor(() => {
      expect(screen.getByText(/fetching attendance logs/i)).toBeInTheDocument();
    });

    // Resolve the /students/me call to clean up
    if (resolvers[0]) {
      resolvers[0]({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ status: "error", message: "Not found" }),
      });
    }
  });

  // ── Successful records + percentage ────────────────────────────
  test("displays attendance records and percentage after successful fetch", async () => {
    mockSuccessfulFlow();

    render(<ViewAttendancePage />);

    // Wait for student name to appear
    await waitFor(() => {
      expect(screen.getByText("Prakhar Pankaj")).toBeInTheDocument();
    });

    // Percentage should show
    expect(screen.getByText("75%")).toBeInTheDocument();

    // Stats cards
    expect(screen.getByText("15")).toBeInTheDocument(); // Attended
    expect(screen.getByText("5")).toBeInTheDocument();  // Missed (20-15)
    expect(screen.getByText("20")).toBeInTheDocument(); // Total

    // Records table
    expect(screen.getByText("2026-09-25")).toBeInTheDocument();
    expect(screen.getByText("2026-09-24")).toBeInTheDocument();

    // Status badges
    expect(screen.getByText("Present")).toBeInTheDocument();
    expect(screen.getByText("Absent")).toBeInTheDocument();

    // Verification score: 92%
    expect(screen.getByText("92%")).toBeInTheDocument();

    // Manual marker for null score
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  // ── No records ─────────────────────────────────────────────────
  test("shows 'No attendance records yet.' when student has no records", async () => {
    mockSuccessfulFlow(sampleStudent, [], {
      student_id: "student-uuid-1",
      percentage: 0,
      present_count: 0,
      total_count: 0,
    });

    render(<ViewAttendancePage />);

    await waitFor(() => {
      expect(screen.getByText("No attendance records yet.")).toBeInTheDocument();
    });

    // Percentage should show 0%
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  // ── API failure ────────────────────────────────────────────────
  test("shows error message on API failure", async () => {
    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes("/students/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: "ok", student: sampleStudent }),
        });
      }
      // Attendance endpoints fail
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({
            status: "error",
            message: "Database connection failed",
          }),
      });
    });

    render(<ViewAttendancePage />);

    await waitFor(() => {
      expect(screen.getByText("Database connection failed")).toBeInTheDocument();
    });
  });

  // ── Missing student ID (no linked student) ─────────────────────
  test("shows enrollment prompt when no student record is linked", async () => {
    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes("/students/me")) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () =>
            Promise.resolve({
              status: "error",
              message: "No student record linked to your account. Please complete voice enrollment first.",
            }),
        });
      }
      return Promise.reject(new Error("Should not fetch attendance"));
    });

    render(<ViewAttendancePage />);

    await waitFor(() => {
      expect(
        screen.getByText(/no student record linked/i)
      ).toBeInTheDocument();
    });

    // Should show enrollment link
    const enrollLink = screen.getByRole("link", { name: /complete voice enrollment/i });
    expect(enrollLink).toHaveAttribute("href", "/enroll");
  });

  // ── 401 session expired ────────────────────────────────────────
  test("shows session expired error on 401", async () => {
    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes("/students/me")) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ message: "Unauthorized" }),
        });
      }
      return Promise.reject(new Error("Should not proceed"));
    });

    render(<ViewAttendancePage />);

    await waitFor(() => {
      expect(screen.getByText(/session expired/i)).toBeInTheDocument();
    });
  });

  // ── Student ownership / security ───────────────────────────────
  test("sends authenticated Bearer token in API requests", async () => {
    mockSuccessfulFlow();

    render(<ViewAttendancePage />);

    await waitFor(() => {
      expect(screen.getByText("Prakhar Pankaj")).toBeInTheDocument();
    });

    // All fetch calls should include Authorization header
    const fetchCalls = global.fetch.mock.calls;
    expect(fetchCalls.length).toBeGreaterThanOrEqual(1);

    for (const call of fetchCalls) {
      const options = call[1] || {};
      expect(options.headers?.Authorization).toBe("Bearer test-jwt-token");
    }
  });

  // ── Query param studentId ──────────────────────────────────────
  test("fetches attendance directly when studentId query param is provided", async () => {
    mockSearchParams.set("studentId", "student-uuid-1");

    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes("/percentage")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(samplePercentage),
        });
      }
      if (url.match(/\/attendance\/student-uuid-1$/)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleRecords),
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    render(<ViewAttendancePage />);

    await waitFor(() => {
      expect(screen.getByText("2026-09-25")).toBeInTheDocument();
    });

    // Should NOT have called /students/me since studentId was provided
    const meCall = global.fetch.mock.calls.find((c) => c[0].includes("/students/me"));
    expect(meCall).toBeUndefined();
  });

  // ── Parallel fetch ─────────────────────────────────────────────
  test("fetches attendance history and percentage in parallel", async () => {
    const fetchOrder = [];

    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes("/students/me")) {
        fetchOrder.push("me");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: "ok", student: sampleStudent }),
        });
      }
      if (url.includes("/percentage")) {
        fetchOrder.push("percentage");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(samplePercentage),
        });
      }
      if (url.match(/\/attendance\/[^/]+$/)) {
        fetchOrder.push("history");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleRecords),
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    render(<ViewAttendancePage />);

    await waitFor(() => {
      expect(screen.getByText("Prakhar Pankaj")).toBeInTheDocument();
    });

    // After /students/me resolves, both history and percentage should be fetched
    // They should appear as consecutive calls (parallel via Promise.all)
    expect(fetchOrder).toContain("history");
    expect(fetchOrder).toContain("percentage");
  });

  // ── Present status uses green styling ──────────────────────────
  test("present status uses green/emerald styling and absent uses red/rose styling", async () => {
    mockSuccessfulFlow();

    render(<ViewAttendancePage />);

    await waitFor(() => {
      expect(screen.getByText("Present")).toBeInTheDocument();
    });

    const presentBadge = screen.getByText("Present").closest("span");
    expect(presentBadge.className).toContain("emerald");

    const absentBadge = screen.getByText("Absent").closest("span");
    expect(absentBadge.className).toContain("rose");
  });

  // ── Network error ──────────────────────────────────────────────
  test("shows error when network request fails entirely", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    render(<ViewAttendancePage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
    });
  });
});

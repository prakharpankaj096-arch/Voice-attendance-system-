import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AdminPage from "../app/admin/page";
import * as AuthContextModule from "../app/context/AuthContext";

// Mock lucide-react icons
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

// Mock next/navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock AuthContext
jest.mock("../app/context/AuthContext", () => ({
  useAuth: jest.fn(),
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

describe("Admin Authentication Management (Tasks 3, 4, 5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();

    AuthContextModule.useAuth.mockReturnValue({
      user: { email: "admin@college.edu", role: "admin" },
      token: "admin-jwt-token",
      isLoggedIn: true,
      isAdmin: true,
      loading: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("renders Set Password and Generate Activation Code action buttons for each student", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ students: mockStudents }),
    });

    render(<AdminPage />);

    expect(await screen.findByText("Alice Cooper")).toBeInTheDocument();
    expect(screen.getByLabelText("Set Password for Alice Cooper")).toBeInTheDocument();
    expect(screen.getByLabelText("Generate Activation Code for Alice Cooper")).toBeInTheDocument();

    expect(screen.getByLabelText("Set Password for Bob Marley")).toBeInTheDocument();
    expect(screen.getByLabelText("Generate Activation Code for Bob Marley")).toBeInTheDocument();
  });

  test("Task 3: opens Set Password modal, validates password strength, and submits POST /admin/students/:id/set-password", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ students: mockStudents }),
    });

    render(<AdminPage />);
    expect(await screen.findByText("Alice Cooper")).toBeInTheDocument();

    // Click Set Password for Alice Cooper
    fireEvent.click(screen.getByLabelText("Set Password for Alice Cooper"));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /set student password/i })).toBeInTheDocument();
    expect(within(dialog).getByText(/Alice Cooper/i)).toBeInTheDocument();

    const newPassInput = screen.getByPlaceholderText(/min 6 chars/i);
    const confirmPassInput = screen.getByPlaceholderText(/re-enter new password/i);
    const submitBtn = screen.getByRole("button", { name: /^set password$/i });

    // Validation: Mismatch
    fireEvent.change(newPassInput, { target: { value: "SecretPass1" } });
    fireEvent.change(confirmPassInput, { target: { value: "MismatchPass2" } });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/confirmation do not match/i)).toBeInTheDocument();

    // Successful update
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok", message: "Password updated successfully for student Alice Cooper." }),
    });

    fireEvent.change(confirmPassInput, { target: { value: "SecretPass1" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/admin/students/student-1/set-password"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer admin-jwt-token",
          }),
          body: JSON.stringify({
            new_password: "SecretPass1",
            confirm_password: "SecretPass1",
          }),
        })
      );
    });

    // Modal closes and feedback banner is shown
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/password successfully updated for Alice Cooper/i)).toBeInTheDocument();
  });

  test("Task 4: generates activation code and displays prominent modal with copy button", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ students: mockStudents }),
    });

    render(<AdminPage />);
    expect(await screen.findByText("Bob Marley")).toBeInTheDocument();

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        message: "Activation code generated successfully.",
        activation_code: "ACT-987654",
        expires_at: futureDate,
        student: { id: "student-2", name: "Bob Marley", roll_number: "CS102" },
      }),
    });

    fireEvent.click(screen.getByLabelText("Generate Activation Code for Bob Marley"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/admin/students/student-2/generate-activation"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer admin-jwt-token",
          }),
        })
      );
    });

    // Modal displays the code prominently
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("ACT-987654")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy code/i })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(new Date(futureDate).toLocaleDateString()))).toBeInTheDocument();
  });

  test("Task 5: displays activation code and expiration prominently after registering a student", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ students: mockStudents }),
    });

    render(<AdminPage />);

    // Switch to Add Student tab
    fireEvent.click(screen.getByRole("button", { name: /add student/i }));
    expect(await screen.findByRole("heading", { name: /register new student/i })).toBeInTheDocument();

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        student: { id: "student-3", name: "Charlie Brown", roll_number: "CS103", department: "Math" },
        activation_code: "ACT-112233",
        expires_at: futureDate,
      }),
    });
    // fetchStudents refresh call
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ students: [...mockStudents, { id: "student-3", name: "Charlie Brown", roll_number: "CS103" }] }),
    });

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. John Doe/i), { target: { value: "Charlie Brown" } });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 21 or CS2026-042/i), { target: { value: "CS103" } });
    fireEvent.click(screen.getByRole("button", { name: /register student/i }));

    // Prominent card displays activation code, expiration, and copy option
    expect(await screen.findByText(/Student Added & Activation Code Generated/i)).toBeInTheDocument();
    expect(screen.getByText("ACT-112233")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy code/i })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(new Date(futureDate).toLocaleDateString()))).toBeInTheDocument();
    expect(screen.getByText(/\/activate/i)).toBeInTheDocument();
  });
});

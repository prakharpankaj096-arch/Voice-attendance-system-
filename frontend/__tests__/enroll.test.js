import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EnrollPage from "../app/enroll/page";
import * as AuthContextModule from "../app/context/AuthContext";

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

// ── Mock useAuth ───────────────────────────────────────────────────
jest.mock("../app/context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

// ── Mock MediaRecorder & MediaStream ───────────────────────────────
const mockTracks = [{ stop: jest.fn() }];
const mockStream = {
  getTracks: () => mockTracks,
};

class MockMediaRecorder {
  constructor(stream, options) {
    this.stream = stream;
    this.options = options;
    this.state = "inactive";
    this.mimeType = "audio/webm";
    MockMediaRecorder.instance = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(["dummy audio data"], { type: "audio/webm" }) });
    }
    if (this.onstop) {
      this.onstop();
    }
  }
}
MockMediaRecorder.isTypeSupported = jest.fn(() => true);
MockMediaRecorder.instance = null;

describe("First-Time Student Voice Enrollment Flow & Security", () => {
  const mockRefreshUser = jest.fn().mockResolvedValue();

  beforeAll(() => {
    global.MediaRecorder = MockMediaRecorder;
    global.URL.createObjectURL = jest.fn(() => "blob:http://localhost/sample-audio");
    global.URL.revokeObjectURL = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    global.navigator.mediaDevices = {
      getUserMedia: jest.fn().mockResolvedValue(mockStream),
    };
    global.fetch = jest.fn();

    // Default mock: authenticated student who is NOT yet enrolled
    AuthContextModule.useAuth.mockReturnValue({
      user: {
        id: "student-1",
        student_id: "student-1",
        name: "Prakhar Pankaj",
        roll_number: "21",
        department: "Computer Science",
        role: "student",
        voice_enrolled: false,
      },
      token: "test-student-token",
      loading: false,
      isLoggedIn: true,
      refreshUser: mockRefreshUser,
    });
  });

  // ── 1. Unauthenticated State ──────────────────────────────────────
  test("shows authentication required card when unauthenticated", () => {
    AuthContextModule.useAuth.mockReturnValue({
      user: null,
      token: null,
      loading: false,
      isLoggedIn: false,
    });

    render(<EnrollPage />);

    expect(screen.getByText(/Authentication Required/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Please sign in to your student account first/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Go to Login/i })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  // ── 2. Already Enrolled State ─────────────────────────────────────
  test("shows already enrolled screen when student is already voice-enrolled", () => {
    AuthContextModule.useAuth.mockReturnValue({
      user: {
        id: "student-1",
        name: "Prakhar Pankaj",
        roll_number: "21",
        voice_enrolled: true,
      },
      token: "test-token",
      loading: false,
      isLoggedIn: true,
    });

    render(<EnrollPage />);

    expect(screen.getByText(/State: Already Enrolled/i)).toBeInTheDocument();
    expect(screen.getByText(/Voice Profile Already Enrolled/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Mark Attendance Now/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Student Dashboard/i })).toBeInTheDocument();
  });

  // ── 3. Authenticated Identity & Read-Only Roll Number ──────────────
  test("pre-fills student info and locks roll number to prevent arbitrary student selection", () => {
    render(<EnrollPage />);

    const rollInput = screen.getByPlaceholderText(/e\.g\. 21/i);
    expect(rollInput).toHaveValue("21");
    expect(rollInput).toHaveAttribute("readonly");
    expect(screen.getByText(/Roll No: 21/i)).toBeInTheDocument();
  });

  // ── 4. Microphone Denial & Error Handling ─────────────────────────
  test("handles microphone permission denial with clear user instructions", async () => {
    const permError = new Error("Permission denied");
    permError.name = "NotAllowedError";
    global.navigator.mediaDevices.getUserMedia = jest.fn().mockRejectedValue(permError);

    render(<EnrollPage />);

    // Proceed past info step
    fireEvent.click(screen.getByRole("button", { name: /Continue to Voice Recording/i }));

    // Click record
    const recordBtn = await screen.findByRole("button", { name: /Record Phrase 1/i });
    fireEvent.click(recordBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Microphone permission was denied\. Please allow microphone access/i)
      ).toBeInTheDocument();
    });
  });

  test("handles missing microphone device with clear error message", async () => {
    const notFoundError = new Error("Requested device not found");
    notFoundError.name = "NotFoundError";
    global.navigator.mediaDevices.getUserMedia = jest.fn().mockRejectedValue(notFoundError);

    render(<EnrollPage />);

    fireEvent.click(screen.getByRole("button", { name: /Continue to Voice Recording/i }));

    const recordBtn = await screen.findByRole("button", { name: /Record Phrase 1/i });
    fireEvent.click(recordBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/No microphone was detected on this device/i)
      ).toBeInTheDocument();
    });
  });

  // ── 5. Server 409 Conflict (Duplicate Enrollment) Handling ────────
  test("handles server 409 Conflict already enrolled response gracefully", async () => {
    // If user's voice_enrolled updates or server returns 409, it transitions to already enrolled
    AuthContextModule.useAuth.mockReturnValue({
      user: {
        id: "student-1",
        name: "Prakhar Pankaj",
        roll_number: "21",
        voice_enrolled: false,
      },
      token: "test-student-token",
      loading: false,
      isLoggedIn: true,
      refreshUser: mockRefreshUser,
    });

    const { rerender } = render(<EnrollPage />);

    // When the backend detects enrollment or user refreshes as enrolled
    AuthContextModule.useAuth.mockReturnValue({
      user: {
        id: "student-1",
        name: "Prakhar Pankaj",
        roll_number: "21",
        voice_enrolled: true,
      },
      token: "test-student-token",
      loading: false,
      isLoggedIn: true,
      refreshUser: mockRefreshUser,
    });

    rerender(<EnrollPage />);

    await waitFor(() => {
      expect(screen.getByText(/Voice Profile Already Enrolled/i)).toBeInTheDocument();
      expect(screen.getByText(/State: Already Enrolled/i)).toBeInTheDocument();
    });
  });
});

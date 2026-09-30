/**
 * Tests for Mark Attendance + TTS Integration – TASK 11
 *
 * Covers:
 * - Successful attendance marking
 * - Already-marked student notification
 * - TTS engine called with formatted response messages
 * - TTS failure does not break attendance flow
 * - Attendance API failure handling
 * - TTS toggle disabling voice output
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ttsEngine from "../lib/ttsEngine";

// ── Mock lucide-react icons ────────────────────────────────────────
jest.mock("lucide-react", () => {
  const stub = (name) => {
    const Component = (props) => <span data-testid={`icon-${name}`} {...props} />;
    Component.displayName = name;
    return Component;
  };
  return {
    Mic: stub("Mic"),
    Square: stub("Square"),
    MessageSquare: stub("MessageSquare"),
    ShieldCheck: stub("ShieldCheck"),
    ShieldAlert: stub("ShieldAlert"),
    Loader2: stub("Loader2"),
    Volume2: stub("Volume2"),
    CheckCircle2: stub("CheckCircle2"),
    UserCheck: stub("UserCheck"),
    VolumeX: stub("VolumeX"),
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

// ── Mock Browser Media Devices & MediaRecorder ──────────────────────
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

let MarkAttendancePage;
beforeAll(async () => {
  global.navigator.mediaDevices = {
    getUserMedia: jest.fn().mockResolvedValue(mockStream),
  };
  global.MediaRecorder = MockMediaRecorder;

  const mod = await import("../app/mark-attendance/page");
  MarkAttendancePage = mod.default;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(ttsEngine, "speak").mockImplementation(() => true);
  jest.spyOn(ttsEngine, "cancel").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("TASK 11: Mark Attendance + TTS Integration", () => {
  // ── 1. Successful Attendance ─────────────────────────────────────
  test("successfully marks attendance, displays formatted message, and calls ttsEngine.speak()", async () => {
    const mockSuccessResponse = {
      status: "ok",
      matched: true,
      already_marked: false,
      student: {
        id: "student-uuid-1",
        name: "Prakhar Pankaj",
        roll_number: "CS021",
      },
      score: 0.92,
      transcription: "Prakhar Pankaj Present",
      detected_intent: "mark_attendance",
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockSuccessResponse),
    });

    render(<MarkAttendancePage />);

    // Click microphone to begin
    fireEvent.click(screen.getByLabelText("Start recording attendance"));

    // Wait for recording to start and click Stop Now to simulate completed voice capture
    await waitFor(() => {
      expect(screen.getByText("Stop Now")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Stop Now"));

    // Assert successful result UI
    await waitFor(() => {
      expect(screen.getByTestId("attendance-status-badge")).toHaveTextContent("VERIFIED");
      expect(screen.getByTestId("assistant-message")).toHaveTextContent(
        "Attendance marked successfully for Prakhar Pankaj."
      );
      expect(screen.getByText("Prakhar Pankaj")).toBeInTheDocument();
      expect(screen.getByText("(Roll: CS021)")).toBeInTheDocument();
      expect(screen.getByText(/0\.9200/)).toBeInTheDocument();
    });

    // Assert TTS called with the exact formatted response
    expect(ttsEngine.speak).toHaveBeenCalledWith("Attendance marked successfully for Prakhar Pankaj.");
  });

  // ── 2. Already Marked Attendance ─────────────────────────────────
  test("handles already_marked: true by showing already-marked panel and speaking via ttsEngine", async () => {
    const mockAlreadyMarkedResponse = {
      status: "ok",
      matched: true,
      already_marked: true,
      student: {
        id: "student-uuid-1",
        name: "Prakhar Pankaj",
        roll_number: "CS021",
      },
      score: 0.89,
      transcription: "Prakhar Pankaj Present",
      detected_intent: "mark_attendance",
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockAlreadyMarkedResponse),
    });

    render(<MarkAttendancePage />);

    fireEvent.click(screen.getByLabelText("Start recording attendance"));

    await waitFor(() => {
      expect(screen.getByText("Stop Now")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Stop Now"));

    // Assert already marked UI panel and badge
    await waitFor(() => {
      expect(screen.getByTestId("attendance-status-badge")).toHaveTextContent("ALREADY MARKED");
      expect(screen.getByTestId("already-marked-panel")).toBeInTheDocument();
      expect(screen.getByTestId("already-marked-panel")).toHaveTextContent(
        "You are already marked present today, Prakhar Pankaj."
      );
    });

    // Assert TTS spoke the already-marked message
    expect(ttsEngine.speak).toHaveBeenCalledWith(
      "You are already marked present today, Prakhar Pankaj."
    );
  });

  // ── 3. TTS Failure Resilience ────────────────────────────────────
  test("TTS failure does not break attendance marking or result display", async () => {
    // Force ttsEngine.speak to throw an unexpected error
    jest.spyOn(ttsEngine, "speak").mockImplementation(() => {
      throw new Error("Speech synthesis audio device error");
    });

    const mockSuccessResponse = {
      status: "ok",
      matched: true,
      already_marked: false,
      student: {
        id: "student-uuid-2",
        name: "Aanya Gupta",
        roll_number: "CS007",
      },
      score: 0.95,
      transcription: "Aanya Gupta Present",
      detected_intent: "mark_attendance",
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockSuccessResponse),
    });

    render(<MarkAttendancePage />);

    fireEvent.click(screen.getByLabelText("Start recording attendance"));

    await waitFor(() => {
      expect(screen.getByText("Stop Now")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Stop Now"));

    // Attendance display still succeeds completely despite TTS error
    await waitFor(() => {
      expect(screen.getByTestId("attendance-status-badge")).toHaveTextContent("VERIFIED");
      expect(screen.getByTestId("assistant-message")).toHaveTextContent(
        "Attendance marked successfully for Aanya Gupta."
      );
      expect(screen.getByText("Aanya Gupta")).toBeInTheDocument();
    });
  });

  // ── 4. Attendance API Failure ────────────────────────────────────
  test("handles attendance API failure with error notice and does not trigger TTS", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ status: "error", message: "Voice service unreachable" }),
    });

    render(<MarkAttendancePage />);

    fireEvent.click(screen.getByLabelText("Start recording attendance"));

    await waitFor(() => {
      expect(screen.getByText("Stop Now")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Stop Now"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Voice service unreachable")).toBeInTheDocument();
    });

    // TTS speak should NOT be called on API error
    expect(ttsEngine.speak).not.toHaveBeenCalled();
  });

  // ── 5. TTS Feedback Toggle ───────────────────────────────────────
  test("when Assistant Voice Feedback is toggled OFF, ttsEngine.speak is not invoked", async () => {
    const mockSuccessResponse = {
      status: "ok",
      matched: true,
      already_marked: false,
      student: {
        id: "student-uuid-1",
        name: "Prakhar Pankaj",
        roll_number: "CS021",
      },
      score: 0.91,
      transcription: "Prakhar Pankaj Present",
      detected_intent: "mark_attendance",
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockSuccessResponse),
    });

    render(<MarkAttendancePage />);

    // Toggle voice feedback OFF
    const toggleBtn = screen.getByRole("button", { name: /assistant voice feedback/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByText(/Assistant Voice Feedback: OFF/i)).toBeInTheDocument();

    // Perform attendance recording
    fireEvent.click(screen.getByLabelText("Start recording attendance"));

    await waitFor(() => {
      expect(screen.getByText("Stop Now")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Stop Now"));

    await waitFor(() => {
      expect(screen.getByTestId("attendance-status-badge")).toHaveTextContent("VERIFIED");
    });

    // ttsEngine.speak was NOT invoked because feedback was toggled off
    expect(ttsEngine.speak).not.toHaveBeenCalled();
  });
});

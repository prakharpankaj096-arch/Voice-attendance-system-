/**
 * Tests for Search Page – TASK 8
 *
 * Covers:
 * - Successful search with results
 * - Loading state
 * - No results
 * - API error
 * - 401 session expired
 * - Clearing search
 * - Stale request handling (AbortController)
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// ── Mock lucide-react icons ────────────────────────────────────────
jest.mock("lucide-react", () => {
  const stub = (name) => {
    const Component = (props) => <span data-testid={`icon-${name}`} {...props} />;
    Component.displayName = name;
    return Component;
  };
  return {
    Search: stub("Search"),
    Loader2: stub("Loader2"),
    User: stub("User"),
    GraduationCap: stub("GraduationCap"),
    CalendarCheck: stub("CalendarCheck"),
    TrendingUp: stub("TrendingUp"),
    ArrowRight: stub("ArrowRight"),
    Mic: stub("Mic"),
    MicOff: stub("MicOff"),
    X: stub("X"),
    AlertCircle: stub("AlertCircle"),
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

// ── Mock AuthContext ───────────────────────────────────────────────
const mockUseAuth = jest.fn();
jest.mock("../app/context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

// ── Helpers ────────────────────────────────────────────────────────
const BACKEND_URL = "http://localhost:5000";

/** Find the submit/Search button specifically (type="submit") */
function getSubmitButton() {
  // The submit button is type="submit" with text "Search" (or "Searching...")
  const buttons = screen.getAllByRole("button");
  const submitBtn = buttons.find((b) => b.getAttribute("type") === "submit");
  if (!submitBtn) throw new Error("Submit button not found");
  return submitBtn;
}

// Import after mocks
let SearchPage;
beforeAll(async () => {
  const mod = await import("../app/search/page");
  SearchPage = mod.default;
});

beforeEach(() => {
  mockUseAuth.mockReturnValue({ token: "test-jwt-token" });
  jest.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────────────
describe("TASK 8: Search Page", () => {
  // ── Successful search ──────────────────────────────────────────
  test("displays search results on successful API response", async () => {
    const mockResults = [
      {
        id: "uuid-1",
        name: "Alice Sharma",
        roll_number: "CS101",
        department: "Computer Science",
        attendance_percentage: 85,
      },
      {
        id: "uuid-2",
        name: "Bob Patel",
        roll_number: "CS102",
        department: "Computer Science",
        attendance_percentage: 60,
      },
    ];

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResults),
    });

    render(<SearchPage />);

    const input = screen.getByPlaceholderText(/search by name/i);
    fireEvent.change(input, { target: { value: "Alice" } });
    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByText("Alice Sharma")).toBeInTheDocument();
    });

    expect(screen.getByText("Bob Patel")).toBeInTheDocument();
    expect(screen.getByText("CS101")).toBeInTheDocument();
    expect(screen.getByText("CS102")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();

    // Verify the API was called with auth header
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/students/search?q=Alice"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-jwt-token",
        }),
      })
    );
  });

  // ── Loading state ──────────────────────────────────────────────
  test("shows loading state while fetching", async () => {
    // Use a fetch that never resolves to keep loading state visible
    let resolveFetch;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    global.fetch = jest.fn().mockReturnValue(fetchPromise);

    render(<SearchPage />);

    const input = screen.getByPlaceholderText(/search by name/i);
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.click(getSubmitButton());

    // Loading indicator should show
    await waitFor(() => {
      expect(screen.getByText(/searching student database/i)).toBeInTheDocument();
    });

    // Resolve fetch to clean up
    resolveFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });

    await waitFor(() => {
      expect(screen.queryByText(/searching student database/i)).not.toBeInTheDocument();
    });
  });

  // ── No results ─────────────────────────────────────────────────
  test("shows 'No students found' when API returns empty array", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });

    render(<SearchPage />);

    const input = screen.getByPlaceholderText(/search by name/i);
    fireEvent.change(input, { target: { value: "nonexistent" } });
    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByText("No students found")).toBeInTheDocument();
    });
  });

  // ── API error ──────────────────────────────────────────────────
  test("shows human-readable error message on API failure", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () =>
        Promise.resolve({
          status: "error",
          message: "Internal server error",
        }),
    });

    render(<SearchPage />);

    fireEvent.change(screen.getByPlaceholderText(/search by name/i), {
      target: { value: "test" },
    });
    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByText("Internal server error")).toBeInTheDocument();
    });
  });

  // ── Network error ──────────────────────────────────────────────
  test("shows network error when fetch throws", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    render(<SearchPage />);

    fireEvent.change(screen.getByPlaceholderText(/search by name/i), {
      target: { value: "test" },
    });
    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
    });
  });

  // ── 401 session expired ────────────────────────────────────────
  test("shows session expired message on HTTP 401", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: "Unauthorized" }),
    });

    render(<SearchPage />);

    fireEvent.change(screen.getByPlaceholderText(/search by name/i), {
      target: { value: "test" },
    });
    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(
        screen.getByText(/session expired/i)
      ).toBeInTheDocument();
    });
  });

  // ── Clearing search ────────────────────────────────────────────
  test("clearing input resets results and state", async () => {
    // First, perform a search
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            id: "uuid-1",
            name: "Alice",
            roll_number: "CS101",
            department: "CS",
            attendance_percentage: 80,
          },
        ]),
    });

    render(<SearchPage />);

    const input = screen.getByPlaceholderText(/search by name/i);
    fireEvent.change(input, { target: { value: "Alice" } });
    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    // Now click the clear button (X icon) which appears when query is non-empty
    const clearBtn = screen.getByTitle("Clear search");
    fireEvent.click(clearBtn);

    // Results should be gone, initial prompt should show
    await waitFor(() => {
      expect(screen.queryByText(/^Alice$/)).not.toBeInTheDocument();
    });
    expect(screen.getByText("Find Any Student")).toBeInTheDocument();
    expect(input.value).toBe("");
  });

  // ── Empty query should not make API request ────────────────────
  test("does not make API request for empty or whitespace-only query", () => {
    global.fetch = jest.fn();

    render(<SearchPage />);

    const input = screen.getByPlaceholderText(/search by name/i);
    fireEvent.change(input, { target: { value: "   " } });

    // Submit button should be disabled
    const submitBtn = getSubmitButton();
    expect(submitBtn).toBeDisabled();

    // Try submitting the form anyway
    fireEvent.submit(input.closest("form"));

    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── Stale request handling ─────────────────────────────────────
  test("newer search supersedes older in-flight request via AbortController", async () => {
    // We verify two things:
    // 1. Every fetch call receives an AbortSignal
    // 2. When a new search fires, the previous AbortController is aborted
    //    so stale results never overwrite fresh ones.

    const signals = []; // collect the signals from each fetch call
    let callCount = 0;

    global.fetch = jest.fn().mockImplementation((url, options) => {
      callCount++;
      const thisCall = callCount;

      if (options?.signal) {
        signals.push({ call: thisCall, signal: options.signal });
      }

      // All calls resolve with unique data, but we'll control timing
      // via whether the signal is aborted
      return new Promise((resolve, reject) => {
        // Check if already aborted
        if (options?.signal?.aborted) {
          return reject(new DOMException("Aborted", "AbortError"));
        }

        const handler = () => {
          reject(new DOMException("Aborted", "AbortError"));
        };
        options?.signal?.addEventListener("abort", handler);

        // Resolve on next microtask (to simulate async)
        Promise.resolve().then(() => {
          if (options?.signal?.aborted) return;
          options?.signal?.removeEventListener("abort", handler);
          resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve([
                {
                  id: `id-${thisCall}`,
                  name: `Result${thisCall}`,
                  roll_number: `R${thisCall}`,
                  department: "Dept",
                  attendance_percentage: thisCall * 10,
                },
              ]),
          });
        });
      });
    });

    render(<SearchPage />);

    const input = screen.getByPlaceholderText(/search by name/i);

    // First search
    await act(async () => {
      fireEvent.change(input, { target: { value: "first" } });
    });

    // Submit first search – this triggers handleSearch, which creates controller #1
    await act(async () => {
      fireEvent.click(getSubmitButton());
    });

    // Wait for the first result to appear, confirming the mechanism works
    await waitFor(() => {
      expect(screen.getByText("Result1")).toBeInTheDocument();
    });

    // Now fire a second search – this should abort controller #1
    await act(async () => {
      fireEvent.change(input, { target: { value: "second" } });
    });
    await act(async () => {
      fireEvent.click(getSubmitButton());
    });

    // The second result should eventually appear
    await waitFor(() => {
      expect(screen.getByText("Result2")).toBeInTheDocument();
    });

    // Verify fetch was called twice and signals were passed
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(signals).toHaveLength(2);

    // The first signal should have been aborted
    expect(signals[0].signal.aborted).toBe(true);

    // The second signal should NOT be aborted
    expect(signals[1].signal.aborted).toBe(false);
  });

  // ── Bearer token is sent ──────────────────────────────────────
  test("sends Authorization header with bearer token from useAuth", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });

    render(<SearchPage />);

    fireEvent.change(screen.getByPlaceholderText(/search by name/i), {
      target: { value: "test" },
    });
    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { Authorization: "Bearer test-jwt-token" },
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  // ── Trims whitespace ──────────────────────────────────────────
  test("trims whitespace from query before sending to API", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });

    render(<SearchPage />);

    fireEvent.change(screen.getByPlaceholderText(/search by name/i), {
      target: { value: "  Alice  " },
    });
    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("q=Alice"),
        expect.any(Object)
      );
    });
  });
});

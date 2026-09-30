import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from '../app/login/page';
import ActivatePage from '../app/activate/page';
import * as AuthContextModule from '../app/context/AuthContext';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock useAuth
jest.mock('../app/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

describe('New Unified Single Login Page', () => {
  let mockLogin;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogin = jest.fn();
    AuthContextModule.useAuth.mockReturnValue({
      login: mockLogin,
      isLoggedIn: false,
      isAdmin: false,
    });
  });

  test('renders unified login header and role selector tabs', () => {
    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: /login/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /student/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /admin/i })).toBeInTheDocument();
  });

  test('defaults to Student role with Roll Number and Password fields', () => {
    render(<LoginPage />);

    expect(screen.getByLabelText(/roll number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^login$/i })).toBeInTheDocument();
    expect(screen.getByText(/first time\? set your password/i)).toBeInTheDocument();
  });

  test('switches to Admin role with Admin ID and Password fields and hides first-time link', () => {
    render(<LoginPage />);

    const adminTab = screen.getByRole('tab', { name: /admin/i });
    fireEvent.click(adminTab);

    expect(screen.getByLabelText(/admin id/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/roll number/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/first time\? set your password/i)).not.toBeInTheDocument();
  });

  test('toggles password visibility', () => {
    render(<LoginPage />);

    const passwordInput = screen.getByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    const toggleButton = screen.getByRole('button', { name: /show password/i });
    fireEvent.click(toggleButton);

    expect(passwordInput).toHaveAttribute('type', 'text');

    const hideButton = screen.getByRole('button', { name: /hide password/i });
    fireEvent.click(hideButton);

    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('shows validation error when roll number or password is empty', async () => {
    render(<LoginPage />);

    const submitButton = screen.getByRole('button', { name: /^login$/i });
    fireEvent.submit(submitButton.closest('form'));

    expect(await screen.findByText(/please enter your roll number/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  test('submits Student login with roll_number and redirects to /', async () => {
    mockLogin.mockResolvedValueOnce({
      user: { role: 'student', is_admin: false },
      session: { access_token: 'student-jwt' },
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/roll number/i), {
      target: { value: '21' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'Secret123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        roll_number: '21',
        password: 'Secret123',
        role: 'student',
      });
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  test('submits Admin login with admin_id and redirects to /admin', async () => {
    mockLogin.mockResolvedValueOnce({
      user: { role: 'admin', is_admin: true },
      session: { access_token: 'admin-jwt' },
    });

    render(<LoginPage />);

    // Switch to Admin tab
    fireEvent.click(screen.getByRole('tab', { name: /admin/i }));

    fireEvent.change(screen.getByLabelText(/admin id/i), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'AdminPass123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        admin_id: 'admin',
        password: 'AdminPass123',
        role: 'admin',
      });
      expect(mockPush).toHaveBeenCalledWith('/admin');
    });
  });

  test('displays user-friendly error on invalid credentials', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid roll number or password.'));

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/roll number/i), {
      target: { value: '999' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'WrongPass123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^login$/i }));

    expect(
      await screen.findByText(/invalid roll number or password\. please verify your credentials\./i)
    ).toBeInTheDocument();
  });

  test('displays activation prompt when account is not yet activated', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Account not activated. Please activate first.'));

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/roll number/i), {
      target: { value: '22' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'SomePass123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^login$/i }));

    expect(
      await screen.findByText(/your account has not been activated yet/i)
    ).toBeInTheDocument();
  });
});

describe('First-Time Account Activation Page (/activate)', () => {
  let mockSetSession;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetSession = jest.fn();
    AuthContextModule.useAuth.mockReturnValue({
      setSession: mockSetSession,
      isLoggedIn: false,
    });
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders all activation fields', () => {
    render(<ActivatePage />);

    expect(screen.getByRole('heading', { name: /first-time account activation/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/roll number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/one-time activation code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^confirm password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set password & continue/i })).toBeInTheDocument();
  });

  test('does not allow activation with only roll number (requires activation code)', async () => {
    render(<ActivatePage />);

    fireEvent.change(screen.getByLabelText(/roll number/i), {
      target: { value: '21' },
    });
    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: 'NewPass123' },
    });
    const submitBtn = screen.getByRole('button', { name: /set password & continue/i });
    fireEvent.submit(submitBtn.closest('form'));

    expect(
      await screen.findByText(/one-time activation code is required/i)
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('validates mismatched passwords', async () => {
    render(<ActivatePage />);

    fireEvent.change(screen.getByLabelText(/roll number/i), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText(/one-time activation code/i), { target: { value: 'ACT-V6BHLG' } });
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'Pass123' } });
    fireEvent.change(screen.getByLabelText(/^confirm password$/i), { target: { value: 'Different123' } });

    fireEvent.click(screen.getByRole('button', { name: /set password & continue/i }));

    expect(
      await screen.findByText(/new password and confirm password do not match/i)
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('validates password strength (min 6 characters with letters and numbers)', async () => {
    render(<ActivatePage />);

    fireEvent.change(screen.getByLabelText(/roll number/i), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText(/one-time activation code/i), { target: { value: 'ACT-V6BHLG' } });
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'pass' } });
    fireEvent.change(screen.getByLabelText(/^confirm password$/i), { target: { value: 'pass' } });

    fireEvent.click(screen.getByRole('button', { name: /set password & continue/i }));

    expect(
      await screen.findByText(/password must be at least 6 characters long/i)
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('submits activation request and sets session on success', async () => {
    jest.useFakeTimers();

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ok',
        message: 'Password created successfully.',
        user: { id: 'student-id-21', name: 'Prakhar Pankaj', roll_number: '21' },
        session: { access_token: 'new-session-jwt' },
      }),
    });

    render(<ActivatePage />);

    fireEvent.change(screen.getByLabelText(/roll number/i), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText(/one-time activation code/i), { target: { value: 'ACT-V6BHLG' } });
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'ValidPass123' } });
    fireEvent.change(screen.getByLabelText(/^confirm password$/i), { target: { value: 'ValidPass123' } });

    fireEvent.click(screen.getByRole('button', { name: /set password & continue/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/activate/set-password'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            roll_number: '21',
            activation_code: 'ACT-V6BHLG',
            password: 'ValidPass123',
            confirm_password: 'ValidPass123',
          }),
        })
      );
      expect(mockSetSession).toHaveBeenCalledWith(
        { access_token: 'new-session-jwt' },
        expect.objectContaining({ id: 'student-id-21', roll_number: '21' })
      );
    });

    // Advance timer for redirect
    jest.advanceTimersByTime(1000);

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('/enroll?roll_number=21')
    );

    jest.useRealTimers();
  });

  test('handles expired activation code error', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        status: 'error',
        message: 'Activation code has expired. Please contact admin.',
      }),
    });

    render(<ActivatePage />);

    fireEvent.change(screen.getByLabelText(/roll number/i), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText(/one-time activation code/i), { target: { value: 'ACT-OLD123' } });
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'ValidPass123' } });
    fireEvent.change(screen.getByLabelText(/^confirm password$/i), { target: { value: 'ValidPass123' } });

    fireEvent.click(screen.getByRole('button', { name: /set password & continue/i }));

    expect(
      await screen.findByText(/this activation code has expired\. please contact your administrator for a new code\./i)
    ).toBeInTheDocument();
  });
});

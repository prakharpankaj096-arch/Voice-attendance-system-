import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChangePasswordPage from '../app/change-password/page';
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

describe('Student Change Password Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('redirects and shows authentication required message when user is not logged in', () => {
    AuthContextModule.useAuth.mockReturnValue({
      user: null,
      token: null,
      isLoggedIn: false,
      loading: false,
    });

    render(<ChangePasswordPage />);

    expect(screen.getByText(/authentication required/i)).toBeInTheDocument();
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  test('renders form fields when user is authenticated', () => {
    AuthContextModule.useAuth.mockReturnValue({
      user: { id: 's-1', name: 'John Doe', roll_number: 'CS101' },
      token: 'valid-jwt-token',
      isLoggedIn: true,
      loading: false,
    });

    render(<ChangePasswordPage />);

    expect(screen.getByRole('heading', { name: /^change password$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^current password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^confirm new password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
  });

  test('validates password requirements before submitting', async () => {
    AuthContextModule.useAuth.mockReturnValue({
      user: { id: 's-1', name: 'John Doe' },
      token: 'valid-jwt-token',
      isLoggedIn: true,
      loading: false,
    });

    render(<ChangePasswordPage />);

    const submitBtn = screen.getByRole('button', { name: /change password/i });
    const form = submitBtn.closest('form');

    // Missing fields
    fireEvent.submit(form);
    expect(await screen.findByText(/please enter your current password/i)).toBeInTheDocument();

    // Current entered, missing new password
    fireEvent.change(screen.getByLabelText(/^current password$/i), { target: { value: 'OldPass123' } });
    fireEvent.submit(form);
    expect(await screen.findByText(/please enter a new password/i)).toBeInTheDocument();

    // Short password (< 6 chars)
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), { target: { value: 'abc' } });
    fireEvent.submit(form);
    expect(await screen.findByText(/at least 6 characters/i)).toBeInTheDocument();

    // Missing numbers
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'abcdefgh' } });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), { target: { value: 'abcdefgh' } });
    fireEvent.submit(form);
    expect(await screen.findByText(/contain at least one letter and one number/i)).toBeInTheDocument();

    // Mismatched passwords
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'NewPass123' } });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), { target: { value: 'Different123' } });
    fireEvent.submit(form);
    expect(await screen.findByText(/confirmation do not match/i)).toBeInTheDocument();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('submits successfully and shows success message, clearing password inputs', async () => {
    AuthContextModule.useAuth.mockReturnValue({
      user: { id: 's-1', name: 'John Doe' },
      token: 'valid-jwt-token',
      isLoggedIn: true,
      loading: false,
    });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok', message: 'Password updated successfully.' }),
    });

    render(<ChangePasswordPage />);

    fireEvent.change(screen.getByLabelText(/^current password$/i), { target: { value: 'CurrentPass1' } });
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'BrandNewPass2' } });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), { target: { value: 'BrandNewPass2' } });

    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/students/change-password'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-jwt-token',
          }),
          body: JSON.stringify({
            current_password: 'CurrentPass1',
            new_password: 'BrandNewPass2',
            confirm_password: 'BrandNewPass2',
          }),
        })
      );
    });

    expect(await screen.findByText(/password changed successfully/i)).toBeInTheDocument();

    // Input fields cleared after success
    expect(screen.getByLabelText(/^current password$/i).value).toBe('');
    expect(screen.getByLabelText(/^new password$/i).value).toBe('');
    expect(screen.getByLabelText(/^confirm new password$/i).value).toBe('');
  });

  test('displays error message when backend rejects request', async () => {
    AuthContextModule.useAuth.mockReturnValue({
      user: { id: 's-1', name: 'John Doe' },
      token: 'valid-jwt-token',
      isLoggedIn: true,
      loading: false,
    });

    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ status: 'error', message: 'Incorrect current password.' }),
    });

    render(<ChangePasswordPage />);

    fireEvent.change(screen.getByLabelText(/^current password$/i), { target: { value: 'WrongCurrentPass1' } });
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'NewSecret123' } });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), { target: { value: 'NewSecret123' } });

    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByText(/current password is incorrect/i)).toBeInTheDocument();
  });
});

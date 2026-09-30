import { render, screen } from '@testing-library/react';
import NavBar from '../app/components/NavBar';
import * as AuthContextModule from '../app/context/AuthContext';

// Mock useAuth
jest.mock('../app/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

describe('NavBar Component', () => {
  test('renders logo and navigation links when logged out', () => {
    AuthContextModule.useAuth.mockReturnValue({
      user: null,
      isLoggedIn: false,
      loading: false,
      logout: jest.fn(),
    });

    render(<NavBar />);

    expect(screen.getByText('Voice Attendance')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Mark Attendance')).toBeInTheDocument();
    expect(screen.getByText('View Attendance')).toBeInTheDocument();
    expect(screen.getByText('Search Student')).toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  test('renders user email and logout button when logged in', () => {
    AuthContextModule.useAuth.mockReturnValue({
      user: { email: 'student@example.com' },
      isLoggedIn: true,
      loading: false,
      logout: jest.fn(),
    });

    render(<NavBar />);

    expect(screen.getByText('student@example.com')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
    expect(screen.queryByText('Login')).not.toBeInTheDocument();
  });
});

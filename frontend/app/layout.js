import { Geist, Geist_Mono } from "next/font/google";
import {
  LayoutDashboard,
  Mic,
  BarChart3,
  Search,
} from "lucide-react";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import NavBar from "./components/NavBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Voice Attendance System",
  description:
    "Student attendance via voice biometric verification with AI assistant",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <NavBar />

          {/* ── Page content ──────────────────────────────────────── */}
          <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
            {children}
          </main>

          {/* ── Footer ────────────────────────────────────────────── */}
          <footer className="text-center text-sm text-slate-400 py-6 border-t border-slate-200">
            Voice Attendance System — Dept. of CSE
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}

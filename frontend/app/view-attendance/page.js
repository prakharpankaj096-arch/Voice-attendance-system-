import { BarChart3, TrendingUp } from "lucide-react";

/**
 * View Attendance page.
 * Student view: own attendance history table + percentage at top.
 * Admin view: filterable by student/date (Week 3).
 */
export default function ViewAttendancePage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-emerald-50 rounded-lg p-2">
          <BarChart3 className="w-5 h-5 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">View Attendance</h1>
      </div>
      <p className="text-slate-500 text-sm mb-8 ml-12">
        Your attendance history and overall percentage.
      </p>

      {/* ── Attendance percentage hero ─────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center mb-8 flex flex-col items-center">
        <div className="bg-emerald-50 rounded-full p-3 mb-3">
          <TrendingUp className="w-6 h-6 text-emerald-600" />
        </div>
        <span className="text-5xl font-bold text-slate-900">—%</span>
        <p className="text-sm font-medium text-slate-500 mt-2">Overall Attendance</p>
      </div>

      {/* ── Attendance table ───────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Date</th>
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Time</th>
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={3} className="px-5 py-10 text-center text-slate-400 italic">
                No attendance records yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

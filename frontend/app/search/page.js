import { Search as SearchIcon } from "lucide-react";

/**
 * Search Student page.
 * Search bar (text or voice input) → results show name, roll number, attendance %.
 */
export default function SearchPage() {
  return (
    <div className="max-w-lg mx-auto mt-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-violet-50 rounded-lg p-2">
          <SearchIcon className="w-5 h-5 text-violet-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Search Student</h1>
      </div>
      <p className="text-slate-500 text-sm mb-8 ml-12">
        Look up a student by name or roll number.
      </p>

      {/* ── Search bar ─────────────────────────────────────────── */}
      <div className="flex gap-2 mb-8">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Name or roll number..."
            className="w-full rounded-lg border border-slate-300 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          />
        </div>
        <button className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shrink-0">
          Search
        </button>
      </div>

      {/* ── Results area ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <SearchIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-400 text-sm">
          Search results will appear here.
        </p>
      </div>
    </div>
  );
}

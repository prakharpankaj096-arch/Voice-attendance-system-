# Implementation Plan: Voice Attendance Completion

## Overview

This plan wires up the remaining three pillars of the Voice Attendance System in one coherent pass:

1. **Five new Express backend routes** added to `backend/src/index.js` — student search, attendance history, attendance percentage, admin student edit, and admin attendance logs.
2. **Three frontend pages** promoted from static skeletons to fully live React components — Search, View Attendance, and Admin (student list + edit form + logs viewer).
3. **AI assistant client-side layer** — `intentDetector.js`, `responseFormatter.js`, and `ttsEngine.js` under `frontend/app/lib/`, plus integration into the Mark Attendance page for already-marked handling.
4. **Test infrastructure and property-based / unit tests** for all 11 correctness properties and key backend/frontend scenarios.

Each task builds directly on the previous output so there is no orphaned code.

---

## Tasks

- [ ] 1. Set up test infrastructure for backend and frontend
  - [ ] 1.1 Add Jest and fast-check to backend devDependencies and create `backend/jest.config.js`
    - Add `"jest": "^29"`, `"fast-check": "^3"`, and `"@jest/globals"` to `devDependencies` in `backend/package.json`
    - Add `"test": "jest --runInBand"` to `backend/package.json` scripts
    - Create `backend/jest.config.js` with `testEnvironment: 'node'` and `testMatch: ['**/__tests__/**/*.test.js']`
    - Create the directory `backend/src/__tests__/` (add a `.gitkeep` placeholder if needed)
    - _Requirements: Testing Strategy (design.md §Testing Strategy)_

  - [ ] 1.2 Add Jest, fast-check, and React Testing Library to frontend devDependencies and create `frontend/jest.config.js`
    - Add `"jest": "^29"`, `"jest-environment-jsdom"`, `"@testing-library/react"`, `"@testing-library/jest-dom"`, `"@testing-library/user-event"`, `"fast-check": "^3"`, and `"babel-jest"` to `devDependencies` in `frontend/package.json`
    - Add `"test": "jest --runInBand"` to `frontend/package.json` scripts
    - Create `frontend/jest.config.js` using `next/jest` transform with `testEnvironment: 'jsdom'` and `testMatch: ['**/__tests__/**/*.test.js', '**/lib/__tests__/**/*.test.js']`
    - Create `frontend/app/lib/__tests__/` directory
    - _Requirements: Testing Strategy (design.md §Testing Strategy)_

- [ ] 2. Implement `GET /students/search` backend route
  - [ ] 2.1 Add the `GET /students/search` route to `backend/src/index.js`
    - Place after the existing `/stats` route, before the voice/attendance section
    - Apply `requireAuth` middleware
    - Trim and validate `req.query.q`; return 400 with `"Search query is required and must not be empty."` if absent, empty, or whitespace-only
    - Supabase `ilike` query on `name` and `roll_number` columns with `.or('name.ilike.%q%,roll_number.ilike.%q%')`, limit 50
    - Compute `attendance_percentage` per result using a correlated `.select()` sub-count from the `attendance` table (`status = 'present'` count vs total count), applying `FLOOR(present/total*100)` or 0 when total is 0
    - Strip `voice_embedding` from every result object before responding
    - Return `{ status: 'ok', students: [...] }` on success; `{ status: 'error', message: 'Search failed. Please try again.' }` on db error
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [ ]* 2.2 Write property tests for student search (Properties 1, 2, 3, 4)
    - Create `backend/src/__tests__/studentSearch.property.test.js`
    - Mock the Supabase client module
    - **Property 2: Search Result Shape and Security** — for any mocked result set, assert every object contains `id, name, roll_number, department, attendance_percentage` and does NOT contain `voice_embedding`; **Validates: Requirements 1.2, 1.5**
    - **Property 3: Search Filter Correctness** — for any non-empty query string `q`, assert every returned student's `name` or `roll_number` contains `q` (case-insensitive) and `students.length <= 50`; **Validates: Requirements 1.1**
    - **Property 4: Whitespace Query Rejection** — for any string composed entirely of whitespace, assert the route handler returns 400; **Validates: Requirements 1.4**
    - **Property 1 (percentage formula)** — for arbitrary `(present_count, total_count)` pairs, assert the computed `attendance_percentage` equals `total_count === 0 ? 0 : Math.floor(present_count / total_count * 100)`; **Validates: Requirements 1.6**
    - Tag each test: `// Feature: voice-attendance-completion, Property {N}: {title}`
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6_

  - [ ]* 2.3 Write unit tests for `GET /students/search`
    - Create `backend/src/__tests__/studentSearch.unit.test.js`
    - Test: auth enforced → 401 without token
    - Test: 400 on empty `q`, 400 on whitespace-only `q`
    - Test: 500 when Supabase returns an error
    - Test: 200 with empty array when no matches
    - _Requirements: 1.4, 1.7, 1.8, 1.9_

- [ ] 3. Implement `GET /attendance/:student_id` and `GET /attendance/:student_id/percentage` backend routes
  - [ ] 3.1 Add `GET /attendance/:student_id` to `backend/src/index.js`
    - Apply `requireAuth` middleware
    - If `req.user.role === 'student'`, look up the student row where `auth_user_id = req.user.id`; if `student.id !== req.params.student_id`, return 403 `"Access denied."`
    - Query `attendance` table for matching `student_id` ordered by `date` descending
    - If the student ID does not exist in `students` table, return 404 `"Student not found."`
    - Return `{ status: 'ok', records: [...] }` with fields `id, date, time, status, verification_score`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ] 3.2 Add `GET /attendance/:student_id/percentage` to `backend/src/index.js`
    - Apply `requireAuth` middleware
    - Same student-ownership check as 3.1; 403 on mismatch, 404 if student not found
    - Count total records and present records for the student; compute `Math.floor(present/total*100)` or 0 when total is 0
    - Return `{ status: 'ok', student_id, percentage, present_count, total_count }`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 3.3 Write property tests for attendance history sort order and percentage formula
    - Create `backend/src/__tests__/attendanceHistory.property.test.js`
    - **Property 5: Attendance History Sort Order** — for any array of mocked attendance records with arbitrary dates, assert after the route processes them, no record at position `i` has a later `date` than the record at position `i-1`; **Validates: Requirements 2.1**
    - Create `backend/src/__tests__/attendancePercentage.property.test.js`
    - **Property 1: Attendance Percentage Formula** — for any `(present_count, total_count)` with `present_count <= total_count`, assert the percentage endpoint returns `total_count === 0 ? 0 : Math.floor(present_count / total_count * 100)`; **Validates: Requirements 1.6, 3.1, 3.4, 3.5**
    - _Requirements: 2.1, 3.1, 3.4, 3.5_

  - [ ]* 3.4 Write unit tests for attendance history and percentage routes
    - Create `backend/src/__tests__/attendanceHistory.unit.test.js`
    - Test: 403 when student accesses another student's records
    - Test: 404 when `student_id` is unknown
    - Test: 200 with empty array when no records exist
    - Test: percentage returns 0 when `total_count` is 0
    - _Requirements: 2.2, 2.4, 2.7, 3.4_

- [ ] 4. Implement `PUT /admin/students/:id` backend route
  - [ ] 4.1 Add `PUT /admin/students/:id` to `backend/src/index.js`
    - Apply `requireAuth` and `requireAdmin` middleware
    - Extract `name`, `roll_number`, `department` from `req.body`; reject with 400 if none present or required fields are empty strings
    - Validate field length constraints: `name` 1–100, `roll_number` 1–50, `department` 0–100
    - If `roll_number` is provided, query for an existing student with that `roll_number` and `id != req.params.id`; return 409 `"A student with this roll number already exists."` on conflict
    - Check student exists; return 404 `"Student not found."` if not
    - Apply `.update({...only_provided_fields})` and return updated row stripped of `voice_embedding`, with `voice_enrolled` boolean computed from whether `voice_embedding` is non-null
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [ ]* 4.2 Write property test for partial update isolation
    - Create `backend/src/__tests__/studentEdit.property.test.js`
    - **Property 7: Partial Update Isolation** — for any subset of `{name, roll_number, department}`, assert that only the provided fields change and all omitted fields retain their original mocked values after the update; **Validates: Requirements 4.1**
    - _Requirements: 4.1_

  - [ ]* 4.3 Write unit tests for `PUT /admin/students/:id`
    - Create `backend/src/__tests__/studentEdit.unit.test.js`
    - Test: 409 on duplicate roll_number
    - Test: 400 on empty body
    - Test: 400 on empty string for required field
    - Test: 404 on unknown student id
    - Test: 403 for non-admin user
    - _Requirements: 4.2, 4.3, 4.6, 4.7_

- [ ] 5. Implement `GET /admin/attendance` backend route
  - [ ] 5.1 Add `GET /admin/attendance` to `backend/src/index.js`
    - Apply `requireAuth` and `requireAdmin` middleware
    - Validate optional `student_id` param with UUID regex; return 400 `"Invalid student_id format."` on mismatch
    - Validate optional `date` param against `/^\d{4}-\d{2}-\d{2}$/`; return 400 `"Invalid date format. Use YYYY-MM-DD."` on mismatch
    - Supabase query: join `attendance` with `students` selecting `id, student_id, students(name, roll_number), date, time, status, verification_score`; apply optional `student_id` and/or `date` equality filters; order by `date` desc then `time` desc; limit 1000
    - Flatten joined fields so the response shape matches `AdminAttendanceRecord` (flat `student_name`, `roll_number` fields)
    - Return `{ status: 'ok', records: [...] }`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [ ]* 5.2 Write property test for admin attendance log sort order and filter invariant
    - Create `backend/src/__tests__/adminAttendance.property.test.js`
    - **Property 6: Admin Attendance Log Sort Order and Filter Invariant** — for any combination of mocked filter inputs `(student_id?, date?)` and any result set, assert: all records satisfy applied filter predicates; records are ordered date desc then time desc; count is at most 1000; **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 5.3 Write unit tests for `GET /admin/attendance`
    - Create `backend/src/__tests__/adminAttendance.unit.test.js`
    - Test: 400 on malformed `student_id` UUID
    - Test: 400 on malformed `date` (e.g., "2024/01/01")
    - Test: 403 on non-admin user
    - Test: 200 with empty array when no records match
    - _Requirements: 5.5, 5.6, 5.8, 5.9_

- [ ] 6. Checkpoint — backend routes complete
  - Ensure all backend tests pass with `cd backend && npx jest --runInBand`. Ask the user if any questions arise.

- [ ] 7. Implement AI assistant library modules
  - [ ] 7.1 Create `frontend/app/lib/intentDetector.js`
    - Export `detectIntent(utterance)` returning `'mark_attendance' | 'check_attendance' | 'search_student' | 'unknown'`
    - Evaluation order (first match wins): `/\bpresent\b/i` → `mark_attendance`; `/\b(percentage|attendance|how many classes|attended)\b/i` → `check_attendance`; `/\b(search|find)\b/i` → `search_student`; else → `unknown`
    - Return `'unknown'` for empty string or null input without throwing
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ] 7.2 Create `frontend/app/lib/responseFormatter.js`
    - Export `formatResponse(intent, data, query)` always returning a string, never throwing
    - Template map per design: `check_attendance`, `search_student` (found / not-found), `mark_attendance` (new / already), `unknown`, unknown intent string → `unknown` fallback
    - Truncate `query` to 100 chars in the not-found template
    - Return `"Sorry, I couldn't retrieve the data needed to complete your request."` when a data-dependent intent has null/incomplete `data`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9_

  - [ ] 7.3 Create `frontend/app/lib/ttsEngine.js`
    - Export `speak(text, callbacks)`, `stopSpeaking()`, `isSpeaking()`
    - `speak`: truncate `text` to 5000 chars; call `window.speechSynthesis.cancel()` first; create `SpeechSynthesisUtterance`, set `lang = 'en-US'`; wire `onstart → callbacks.onStart`, `onend → callbacks.onEnd`, `onerror → callbacks.onError`; call `window.speechSynthesis.speak(utterance)`
    - No-op gracefully (no throw) if `window.speechSynthesis` is unavailable
    - _Requirements: 13.1, 13.2, 13.4, 13.5, 13.7, 13.8_

  - [ ]* 7.4 Write property-based tests for intentDetector (Properties 8, 9)
    - Create `frontend/app/lib/__tests__/intentDetector.property.test.js`
    - **Property 8: Intent Detection — Keyword Coverage** — for any utterance containing a recognized keyword as a whole word, assert `detectIntent` returns a non-`'unknown'` value that is the highest-priority matching intent; **Validates: Requirements 11.1, 11.2, 11.3, 11.5**
    - **Property 9: Intent Detection — Totality** — for any string of 1–500 characters, assert `detectIntent` returns exactly one of `['mark_attendance', 'check_attendance', 'search_student', 'unknown']`; **Validates: Requirements 11.4, 11.6**
    - Use `fc.string()` with `minLength: 1, maxLength: 500` for totality; use `fc.constantFrom(...)` + `fc.string()` combinator to build keyword-containing strings for coverage
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 7.5 Write property-based tests for responseFormatter (Properties 10, 11)
    - Create `frontend/app/lib/__tests__/responseFormatter.property.test.js`
    - **Property 10: Response Formatter — Template Correctness** — for valid `(intent, data)` pairs with all required fields present, assert the exact template string is returned for each of the four known intents and both `already_marked` variants; **Validates: Requirements 12.1, 12.2, 12.4, 12.5, 12.7**
    - **Property 11: Response Formatter — No-Match Query Truncation** — for any query string of any length with `search_student` intent and null/not-found data, assert the result equals `"No student found matching '${query.slice(0, 100)}'."` with the query capped at 100 chars; **Validates: Requirements 12.3**
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 7.6 Write unit tests for ttsEngine, intentDetector, and responseFormatter
    - Create `frontend/app/lib/__tests__/ttsEngine.unit.test.js`
      - Mock `window.speechSynthesis` with jest spies
      - Test: `cancel()` is called before `speak()`
      - Test: `lang` is set to `'en-US'` on the utterance
      - Test: text > 5000 chars is truncated before speaking
      - Test: no-op (no throw) when `window.speechSynthesis` is undefined
    - Create `frontend/app/lib/__tests__/intentDetector.unit.test.js`
      - Test: empty string → `'unknown'`
      - Test: `"present"` → `'mark_attendance'`; `"attendance"` → `'check_attendance'`; `"search"` → `'search_student'`
      - Test: utterance with both `"present"` and `"attendance"` → `'mark_attendance'` (priority order)
    - Create `frontend/app/lib/__tests__/responseFormatter.unit.test.js`
      - Test: null data for data-dependent intent → fallback string
      - Test: unknown intent string → unknown fallback
      - Test: `already_marked: true` path
    - _Requirements: 11.1–11.6, 12.1–12.9, 13.1–13.8_

- [ ] 8. Wire up the Search page (`frontend/app/search/page.js`)
  - [ ] 8.1 Rewrite `frontend/app/search/page.js` as a `"use client"` component with live API integration
    - Add `"use client"` directive and import `useState`, `useRef`, `useEffect` from React
    - Import `useAuth` from `../context/AuthContext`; read the session token
    - State: `query` (string), `results` (null | array), `loading` (boolean), `error` (string | null), `abortRef` (useRef for AbortController)
    - Form `onSubmit`: trim query; skip if empty; cancel previous in-flight request via `abortRef.current.abort()`; create new `AbortController`; set `loading = true`, `results = null`, `error = null`; fetch `GET /students/search?q=${encodeURIComponent(query)}` with `Authorization: Bearer <token>` and `signal`; on 401 show session-expired message; on other errors set error state; on success set `results`
    - Render: loading spinner while `loading`; result cards (name, roll number, `${percentage}%`) when `results` is a non-empty array; "No students found" when `results` is `[]`; error message when `error` is set; input clear → set `query = ''` and `results = null`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [ ]* 8.2 Write unit/integration tests for SearchPage
    - Create `frontend/app/search/__tests__/SearchPage.test.js`
    - Mock `fetch` and `useAuth`
    - Test: loading indicator appears during in-flight request
    - Test: result cards render with name, roll number, percentage
    - Test: "No students found" when empty array returned
    - Test: error message on 500 response
    - Test: 401 response shows session-expired message
    - Test: clearing input resets state to initial (no results shown)
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

- [ ] 9. Wire up the View Attendance page (`frontend/app/view-attendance/page.js`)
  - [ ] 9.1 Rewrite `frontend/app/view-attendance/page.js` as a `"use client"` component with live API integration
    - Add `"use client"` directive; import `useState`, `useEffect` from React; import `useAuth`
    - State: `records` (null | array), `percentage` (null | number), `loadingRecords` (boolean), `loadingPct` (boolean), `error` (string | null), `studentId` (string | null)
    - On mount: read `studentId` from `localStorage` key `'student_id'`; if absent display "complete enrollment" message; if present, call `Promise.all([fetch GET /attendance/:id, fetch GET /attendance/:id/percentage])` in parallel with auth header
    - Percentage hero: show `Loader2` spinner while `loadingPct`; show `${percentage}%` when loaded
    - Table body: show `Loader2` rows while `loadingRecords`; render rows with `date` (YYYY-MM-DD), `time` (HH:MM extracted from ISO string), and colored status badge (`present` → green, `absent` → red)
    - Show "No attendance records yet." when `records` is an empty array
    - Show error message and hide all data if either fetch fails
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

  - [ ]* 9.2 Write unit/integration tests for ViewAttendancePage
    - Create `frontend/app/view-attendance/__tests__/ViewAttendancePage.test.js`
    - Mock `fetch`, `useAuth`, and `localStorage`
    - Test: loading indicators visible during parallel fetches
    - Test: percentage hero shows correct integer value
    - Test: rows render with correct date format, time format, green/red badge
    - Test: "No attendance records yet." when empty array
    - Test: no `student_id` in localStorage → enrollment message shown
    - Test: error response → error message shown, no partial data
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

- [ ] 10. Wire up the Admin page (`frontend/app/admin/page.js`)
  - [ ] 10.1 Add live student list loading and delete/reset-voice actions to `frontend/app/admin/page.js`
    - Add state: `students` (array), `loadingStudents` (boolean), `listError` (string | null), `actionError` (string | null)
    - On mount (when `isAdmin === true`): fetch `GET /admin/students` with auth header; set `students` from response; handle errors with `listError`
    - Replace static table body with a `students.map(...)` render: columns Name, Roll Number, Department, Voice Enrolled (`voice_enrolled ? "Yes" : "No"`), and Actions
    - Actions column: "Remove" button → `DELETE /admin/students/:id`; on 200 remove the row from local `students` state; on error set `actionError`
    - "Reset Voice" button → `POST /admin/students/:id/reset-voice`; on 200 set `voice_enrolled = false` for that row in state; on error set `actionError`
    - Show `actionError` as a dismissible notification banner above the table
    - Loading spinner in table body while `loadingStudents`; retry button if `listError`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_

  - [ ] 10.2 Add inline edit form to the Admin page student table
    - Add state: `editingId` (string | null), `editForm` (`{ name, roll_number, department }`), `editError` (string | null), `editSubmitting` (boolean)
    - "Edit" button per row: set `editingId = student.id`; populate `editForm` with current student values
    - While `editingId` matches a row, render that row as inline form inputs for `name`, `roll_number`, `department` with client-side validation (name 1–100, roll_number 1–50, department 0–100)
    - Submit: compute changed fields only; if none changed, dismiss without API call; else send `PUT /admin/students/:id` with changed fields
    - On 200: update `students` state with returned updated student; clear `editingId`
    - On 409: show `"This roll number is already taken."` next to roll_number field; keep form open
    - On other error: set `editError` notification; keep form open
    - "Cancel" button: clear `editingId` and `editError` without API call
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [ ] 10.3 Add Attendance Logs viewer to the Admin page
    - Add state: `logsVisible` (boolean), `logs` (array), `logsLoading` (boolean), `logsError` (string | null), `logFilters` (`{ student_id: '', date: '' }`)
    - Wire the "Attendance Logs" action card button: on click, set `logsVisible = true` and fetch `GET /admin/attendance` (no filters initially)
    - Build logs table with columns: student name, roll number, date (YYYY-MM-DD), time (HH:MM), status, verification score
    - Add a date filter `<input type="date">` and a student name/roll text filter; on change refetch with updated query params
    - For the student name/roll filter, debounce re-fetch by 400 ms; pass `student_id` only when the filter text resolves to a known student ID from the `students` state (match by name or roll_number from already-loaded list)
    - Loading indicator, "No attendance records found." empty state, and retry on error
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ]* 10.4 Write unit/integration tests for AdminPage
    - Create `frontend/app/admin/__tests__/AdminPage.test.js`
    - Mock `fetch` and `useAuth`
    - Test: student list loads on mount with correct columns
    - Test: remove row calls DELETE and removes row from DOM
    - Test: edit button populates form with correct values
    - Test: 409 response shows "This roll number is already taken." in-line
    - Test: cancel edit does not call API
    - Test: logs table appears when "Attendance Logs" card is clicked
    - _Requirements: 8.3, 8.6, 9.1, 9.5, 9.7, 10.1_

- [ ] 11. Wire AI assistant layer into the Mark Attendance page and handle already-marked state
  - [ ] 11.1 Update `frontend/app/mark-attendance/page.js` to use `ttsEngine.js` and handle `already_marked`
    - Import `speak`, `stopSpeaking`, `isSpeaking` from `../lib/ttsEngine`
    - Replace the inline `speakResponse` function with a call to `speak(text, { onStart, onEnd, onError })` from `ttsEngine.js`
    - Add state: `isSpeaking` (boolean); set `true` in `onStart` callback, `false` in `onEnd` and `onError` callbacks; display a pulsing `Volume2` icon or `"Speaking…"` label while `isSpeaking === true`
    - Add handling for `already_marked: true` in the result display:
      - Render a distinct informational panel (e.g., blue/indigo border) that is visually different from both the success (green) and error (amber/red) panels
      - Display the already-marked message and the student name/roll badge
      - Call `speak("You're already marked present today.")` for TTS output
      - Do NOT render an error indicator for this state
    - _Requirements: 13.3, 13.6, 13.7, 14.1, 14.2, 14.3, 14.4_

  - [ ]* 11.2 Write unit tests for already-marked handling and TTS speaking indicator
    - Create `frontend/app/mark-attendance/__tests__/MarkAttendancePage.test.js`
    - Test: `already_marked: true` response renders informational (non-error) panel
    - Test: `already_marked: true` does not render error indicator
    - Test: `isSpeaking` flag shows speaking indicator during TTS
    - Test: `isSpeaking` clears after `onEnd` callback fires
    - _Requirements: 14.2, 14.3, 14.4, 13.3, 13.6_

- [ ] 12. Final checkpoint — all tests pass
  - Run `cd backend && npx jest --runInBand` and `cd frontend && npx jest --runInBand`. Ensure all tests pass. Ask the user if any questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP delivery
- Each task references specific requirements for full traceability
- Checkpoints (tasks 6 and 12) validate accumulated progress incrementally
- The `student_id` stored in `localStorage` during enrollment is the bridge between auth user and attendance data for the View Attendance page (design.md §ViewAttendancePage note)
- Property tests use `fast-check` with `{ numRuns: 100 }` minimum; tag each test with `// Feature: voice-attendance-completion, Property {N}: {title}`
- The `voice_embedding` field must never reach the client — strip it in every new route that reads from the `students` table
- The `GET /students/search` route computes `attendance_percentage` inline; the same formula is reused in `GET /attendance/:student_id/percentage` — extract to a shared helper if duplication becomes painful
- Admin page task 10 is a three-part progressive enhancement of the same file; sub-tasks 10.1, 10.2, and 10.3 must be executed in order

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "3.2", "4.1", "5.1", "7.1", "7.2", "7.3"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.3", "3.4", "4.2", "4.3", "5.2", "5.3", "7.4", "7.5", "7.6", "8.1"] },
    { "id": 3, "tasks": ["8.2", "9.1", "10.1"] },
    { "id": 4, "tasks": ["9.2", "10.2", "10.4"] },
    { "id": 5, "tasks": ["10.3", "11.1"] },
    { "id": 6, "tasks": ["11.2"] }
  ]
}
```

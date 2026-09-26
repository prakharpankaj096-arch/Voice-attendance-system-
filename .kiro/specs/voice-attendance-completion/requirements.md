# Requirements Document

## Introduction

This feature completes the Voice Attendance System by wiring up three categories of missing functionality:

1. **Missing backend routes** — five new Express endpoints that support student search, per-student attendance history, attendance percentage calculation, student detail editing, and admin-scoped attendance log retrieval.
2. **Frontend page wiring** — three existing skeleton pages (Search, View Attendance, Admin) are connected to real API calls, state management, and live data rendering.
3. **AI Assistant / Conversational layer** — intent detection via keyword matching, template-based natural language response generation, and browser-native Text-to-Speech (TTS) that speaks responses back to the user.

The system must preserve its existing role separation: students access only their own records, while admins get full filterable views.

---

## Glossary

- **Backend**: The Node.js/Express server running on port 5000.
- **Frontend**: The Next.js application running on port 3000.
- **Voice_Service**: The Python/FastAPI microservice running on port 8000 that handles speaker verification and speech-to-text.
- **Supabase**: The PostgreSQL-backed database and authentication provider used by the system.
- **Student**: An authenticated user with role `student` who can only view and interact with their own attendance data.
- **Admin**: An authenticated user with role `admin` who can manage all students and view all attendance records.
- **Intent_Detector**: The client-side or server-side module that classifies a spoken or typed utterance into one of four intents: `mark_attendance`, `check_attendance`, `search_student`, or `unknown`.
- **Response_Formatter**: The module that maps a detected intent plus database results into a template-based natural language sentence.
- **TTS_Engine**: The browser's built-in `window.speechSynthesis` API used to speak formatted responses aloud.
- **Attendance_Record**: A row in the `attendance` table with fields: `id`, `student_id`, `date`, `time`, `status`, `verification_score`.
- **Attendance_Percentage**: The ratio of `present` records to total records for a given student, expressed as a whole-number integer percentage (floor of present_count / total_count × 100).
- **MATCH_THRESHOLD**: The cosine similarity score of 0.75 above which the Voice_Service considers a speaker verified.
- **Search_Query**: A trimmed, non-empty string of 1–100 characters submitted to the student search endpoint as the `q` URL parameter.

---

## Requirements

### Requirement 1: Student Search Endpoint

**User Story:** As a student or admin, I want to search for students by name or roll number, so that I can quickly look up a student's details and attendance percentage without browsing a full list.

#### Acceptance Criteria

1. WHEN a `GET /students/search` request is received with a non-empty `q` query parameter of 1–100 characters (after trimming whitespace), THE Backend SHALL query the `students` table for records where the name or roll number contains the Search_Query (case-insensitive substring match), returning at most 50 results.
2. WHEN the search returns matching students, THE Backend SHALL respond with an array of objects each containing: `id`, `name`, `roll_number`, `department`, and the student's computed Attendance_Percentage.
3. WHEN the search returns no matching students, THE Backend SHALL respond with an empty array and HTTP status 200.
4. IF the `q` query parameter is absent, is an empty string, or contains only whitespace, THEN THE Backend SHALL respond with HTTP status 400 and an error message of `"Search query is required and must not be empty."`.
5. THE Backend SHALL exclude `voice_embedding` from all search responses.
6. WHEN computing the Attendance_Percentage for search results, THE Backend SHALL calculate it as `FLOOR((present_count / total_count) * 100)` where `present_count` is the count of Attendance_Records with `status = 'present'` for that student, and return 0 if `total_count` is 0.
7. IF the Authorization header is missing from the request, THEN THE Backend SHALL respond with HTTP status 401 and an error message indicating authentication is required.
8. IF the Authorization header contains an invalid or expired JWT, THEN THE Backend SHALL respond with HTTP status 401 and an error message indicating the token is invalid.
9. IF the database query fails, THEN THE Backend SHALL respond with HTTP status 500 and an error message of `"Search failed. Please try again."`.

---

### Requirement 2: Per-Student Attendance History Endpoint

**User Story:** As a student, I want to fetch my own attendance history, so that I can see a full log of which dates I was present or absent.

#### Acceptance Criteria

1. WHEN a `GET /attendance/:student_id` request is received with a valid JWT, THE Backend SHALL return all Attendance_Records for the specified `student_id`, ordered by `date` descending.
2. IF the requesting user has role `student` and the `student_id` in the URL does not match the `id` of the student record associated with the authenticated user, THEN THE Backend SHALL respond with HTTP status 403 and an error message indicating access is denied.
3. WHEN the requesting user has role `admin`, THE Backend SHALL return Attendance_Records for any `student_id` without restriction.
4. IF no Attendance_Records exist for the given `student_id`, THEN THE Backend SHALL return an empty array and HTTP status 200.
5. IF the Authorization header is missing or contains an invalid JWT, THEN THE Backend SHALL respond with HTTP status 401.
6. WHEN returning Attendance_Records, THE Backend SHALL include the fields: `id`, `date`, `time`, `status`, and `verification_score`. If `verification_score` is null, it SHALL be returned as `null`.
7. IF the `student_id` does not correspond to any record in the `students` table, THEN THE Backend SHALL respond with HTTP status 404 and an error message indicating the student was not found.

---

### Requirement 3: Attendance Percentage Endpoint

**User Story:** As a student, I want to retrieve my attendance percentage from the server, so that I can see an accurate summary of how often I have been present.

#### Acceptance Criteria

1. WHEN a `GET /attendance/:student_id/percentage` request is received with a valid JWT, THE Backend SHALL compute and return the Attendance_Percentage for that student.
2. IF the requesting user has role `student` and the `student_id` does not match the `id` of the student record linked to the authenticated user, THEN THE Backend SHALL respond with HTTP status 403 and an access-denied error message.
3. IF the requesting user has role `admin`, THEN THE Backend SHALL return the Attendance_Percentage for any `student_id` without restriction.
4. IF a student has zero Attendance_Records, THEN THE Backend SHALL return an Attendance_Percentage of 0.
5. WHEN the computation succeeds, THE Backend SHALL return a JSON object with fields: `student_id`, `percentage` (integer 0–100 computed as `FLOOR(present_count / total_count * 100)`), `present_count`, and `total_count`.
6. IF the Authorization header is missing or contains an invalid JWT, THEN THE Backend SHALL respond with HTTP status 401.
7. IF the `student_id` does not correspond to any record in the `students` table, THEN THE Backend SHALL respond with HTTP status 404 and an error message indicating the student was not found.

---

### Requirement 4: Edit Student Details Endpoint

**User Story:** As an admin, I want to edit a student's name, department, or roll number, so that I can correct data entry mistakes without deleting and re-enrolling the student.

#### Acceptance Criteria

1. WHEN a `PUT /admin/students/:id` request is received with at least one of `name` (1–100 chars), `department` (0–100 chars), or `roll_number` (1–50 chars) in the request body, THE Backend SHALL update only the provided fields for the student with the given `id`.
2. IF the request body contains a `roll_number` that already exists on a different student record, THEN THE Backend SHALL respond with HTTP status 409 and an error message of `"A student with this roll number already exists."`.
3. IF the student with the given `id` does not exist in the `students` table, THEN THE Backend SHALL respond with HTTP status 404 and an error message of `"Student not found."`.
4. WHEN the update succeeds, THE Backend SHALL respond with HTTP status 200 and the full updated student record containing: `id`, `name`, `roll_number`, `department`, `voice_enrolled`, and `created_at` (excluding `voice_embedding`).
5. IF the Authorization header is missing or contains an invalid JWT, THEN THE Backend SHALL respond with HTTP status 401.
6. IF the authenticated user does not have admin role, THEN THE Backend SHALL respond with HTTP status 403.
7. IF the request body is empty, contains no recognized fields, or supplies a field with an empty string where a non-empty value is required (`name`, `roll_number`), THEN THE Backend SHALL respond with HTTP status 400 and a descriptive validation error message.

---

### Requirement 5: Admin Attendance Logs Endpoint

**User Story:** As an admin, I want to retrieve all attendance records with optional filters for date and student, so that I can audit attendance across the entire institution.

#### Acceptance Criteria

1. WHEN a `GET /admin/attendance` request is received, THE Backend SHALL return up to 1000 Attendance_Records joined with student `name` and `roll_number`, ordered by `date` descending then `time` descending.
2. WHEN the `student_id` query parameter is provided, THE Backend SHALL filter results to only Attendance_Records for that student.
3. WHEN the `date` query parameter is provided in `YYYY-MM-DD` format, THE Backend SHALL filter results to only Attendance_Records for that date.
4. WHEN both `student_id` and `date` query parameters are provided, THE Backend SHALL apply both filters simultaneously.
5. IF the Authorization header is missing or contains an invalid JWT, THEN THE Backend SHALL respond with HTTP status 401.
6. IF the authenticated user does not have admin role, THEN THE Backend SHALL respond with HTTP status 403.
7. WHEN no records match the applied filters, THE Backend SHALL return an empty array and HTTP status 200.
8. IF the `student_id` query parameter is provided but is not a valid UUID format, THEN THE Backend SHALL respond with HTTP status 400 and an error message of `"Invalid student_id format."`.
9. IF the `date` query parameter is provided but does not match `YYYY-MM-DD` format, THEN THE Backend SHALL respond with HTTP status 400 and an error message of `"Invalid date format. Use YYYY-MM-DD."`.

---

### Requirement 6: Search Page State and API Wiring

**User Story:** As a student or admin, I want the Search page to execute live queries and display real results, so that searching for students is functional rather than a static placeholder.

#### Acceptance Criteria

1. THE Search_Page SHALL maintain a controlled input field whose value is bound to component state and updates on every keystroke.
2. WHEN the user submits the search form (by clicking Search or pressing Enter) with a non-empty query of 1–200 characters, THE Search_Page SHALL send a `GET /students/search?q={query}` request to the Backend with the authenticated user's JWT in the `Authorization: Bearer <token>` header.
3. WHILE a search request is in flight, THE Search_Page SHALL display a loading indicator in place of the results area, and that loading state SHALL persist until the response is received or an error occurs.
4. WHEN the Backend returns search results, THE Search_Page SHALL render each result as a card or row displaying: student name, roll number, and Attendance_Percentage as a whole-number percentage.
5. WHEN the Backend returns an empty result array, THE Search_Page SHALL display a "No students found" message instead of the results list.
6. IF the Backend returns a non-2xx response, THEN THE Search_Page SHALL display an error message indicating the search failed, and not display partial results.
7. IF the Backend returns a 401 response, THEN THE Search_Page SHALL display a message indicating the session has expired and prompt the user to log in again.
8. WHEN the search input is cleared, THE Search_Page SHALL remove all displayed results and return to the initial empty state.
9. IF a new search is submitted while a previous request is still in flight, THEN THE Search_Page SHALL cancel or ignore the previous request's response and only render the latest result.

---

### Requirement 7: View Attendance Page Data Fetching

**User Story:** As a student, I want the View Attendance page to load my real attendance records and percentage when I visit it, so that I can review my actual attendance history.

#### Acceptance Criteria

1. WHEN the View_Attendance_Page mounts and a Student is authenticated, IF the student's profile is found in the `students` table, THEN THE View_Attendance_Page SHALL fetch the student's Attendance_Records from `GET /attendance/:student_id` using the authenticated user's JWT.
2. WHEN the View_Attendance_Page mounts and a Student is authenticated, IF the student's profile is found in the `students` table, THEN THE View_Attendance_Page SHALL fetch the Attendance_Percentage from `GET /attendance/:student_id/percentage` using the authenticated user's JWT.
3. WHILE either the records fetch or the percentage fetch is in progress, THE View_Attendance_Page SHALL display a loading indicator in the percentage hero and table body respectively.
4. WHEN Attendance_Records are returned, THE View_Attendance_Page SHALL render each record as a table row with columns: Date (formatted as `YYYY-MM-DD`), Time (formatted as `HH:MM`), and Status.
5. WHEN the Attendance_Percentage is returned, THE View_Attendance_Page SHALL display it as a rounded whole number followed by `%` in the percentage hero element, replacing the `—%` placeholder.
6. IF no Attendance_Records are returned, THEN THE View_Attendance_Page SHALL display a "No attendance records yet." message in the table body.
7. WHEN the `status` field of a record is `present`, THE View_Attendance_Page SHALL render the status with a green-colored status badge.
8. WHEN the `status` field of a record is `absent`, THE View_Attendance_Page SHALL render the status with a red-colored status badge.
9. IF either API call returns an error response, THEN THE View_Attendance_Page SHALL display a human-readable error message in place of the loading indicator and not show partial data.
10. IF the authenticated user has no linked record in the `students` table, THEN THE View_Attendance_Page SHALL display a message directing the user to complete voice enrollment before viewing attendance.

---

### Requirement 8: Admin Page — Live Student List

**User Story:** As an admin, I want the Admin page to load the real student list on mount, so that I can see who is registered instead of a static placeholder.

#### Acceptance Criteria

1. WHEN the Admin_Page mounts and the Admin role is confirmed, THE Admin_Page SHALL fetch the student list from `GET /admin/students` using the `Authorization: Bearer <token>` header with the authenticated admin's JWT.
2. WHILE the student list is loading, THE Admin_Page SHALL display a loading indicator in the table body.
3. WHEN the student list is returned, THE Admin_Page SHALL render each student as a table row with columns: Name, Roll Number, Department, Voice Enrolled status (boolean rendered as "Yes"/"No"), and an Actions column.
4. WHEN the student list is empty, THE Admin_Page SHALL display a "No students registered yet." message in the table body.
5. WHILE a student row is displayed, THE Admin_Page SHALL show a Remove button and a Reset Voice button in the Actions column for that row.
6. WHEN the Admin clicks Remove for a student, THE Admin_Page SHALL send a `DELETE /admin/students/:id` request and, upon a 200 response, remove that row from the rendered list without a full page reload.
7. WHEN the Admin clicks Reset Voice for a student, THE Admin_Page SHALL send a `POST /admin/students/:id/reset-voice` request and, upon a 200 response, update that student's Voice Enrolled status to "No" in the rendered row.
8. IF the `GET /admin/students` request fails, THEN THE Admin_Page SHALL display an error message in the table body and provide a retry mechanism.
9. IF the `DELETE /admin/students/:id` request fails, THEN THE Admin_Page SHALL display an error notification and retain the student row in the list.
10. IF the `POST /admin/students/:id/reset-voice` request fails, THEN THE Admin_Page SHALL display an error notification and retain the student's current Voice Enrolled status in the row.

---

### Requirement 9: Admin Page — Edit Student Form

**User Story:** As an admin, I want an inline edit form for each student so that I can correct a student's name, roll number, or department without leaving the page.

#### Acceptance Criteria

1. WHEN the Admin clicks the Edit button for a student row, THE Admin_Page SHALL display an edit form pre-populated with the student's current `name`, `roll_number`, and `department`.
2. THE Admin_Page SHALL validate that `name` is 1–100 characters and `roll_number` is 1–50 characters before submission. `department` may be 0–100 characters including empty. THE Admin_Page SHALL display a field-level validation error and prevent submission if these constraints are violated.
3. WHEN the Admin submits the edit form and at least one field has been changed from its original value, THE Admin_Page SHALL send a `PUT /admin/students/:id` request with only the changed fields in the request body.
4. WHEN the Backend confirms the update (HTTP 200), THE Admin_Page SHALL update the corresponding table row to reflect the new values and dismiss the edit form without a full page reload.
5. IF the Backend returns HTTP 409, THEN THE Admin_Page SHALL display the message "This roll number is already taken." next to the roll number field, and the form SHALL remain open with the entered values preserved.
6. IF the Backend returns a non-409 error, THEN THE Admin_Page SHALL display a generic error notification and keep the form open with the entered values preserved.
7. WHEN the Admin clicks the Cancel button in the edit form, THE Admin_Page SHALL dismiss the edit form and restore the row to its previous state without making any API call.
8. WHEN the Admin submits the edit form and no fields have been changed from their original values, THE Admin_Page SHALL dismiss the form without making an API call.

---

### Requirement 10: Admin Page — Attendance Logs Viewer

**User Story:** As an admin, I want to view all attendance logs on the Admin page with optional filters, so that I can audit attendance without navigating to a separate page.

#### Acceptance Criteria

1. WHEN the Admin clicks the "Attendance Logs" action card, THE Admin_Page SHALL fetch attendance logs from `GET /admin/attendance` and display them in a table with columns: student name, roll number, date (formatted `YYYY-MM-DD`), time (formatted `HH:MM`), status, and verification score.
2. THE Admin_Page SHALL provide a date filter input of type `date`. WHEN the Admin sets a date value, THE Admin_Page SHALL refetch attendance logs with the `date` query parameter set to the selected date in `YYYY-MM-DD` format.
3. THE Admin_Page SHALL provide a student name/roll filter input. WHEN the Admin types in that field, THE Admin_Page SHALL refetch attendance logs with the `student_id` query parameter set to the matching student's ID.
4. WHILE attendance log data is loading, THE Admin_Page SHALL display a loading indicator in the logs table body.
5. IF no records match the applied filters, THEN THE Admin_Page SHALL display a "No attendance records found." message in the table body.
6. IF the `GET /admin/attendance` request fails, THEN THE Admin_Page SHALL display an error message in the logs section and provide a way to retry.

---

### Requirement 11: Intent Detection

**User Story:** As a user on the Mark Attendance page, I want the system to classify my spoken utterance into the correct intent, so that the correct action is triggered without requiring me to navigate manually.

#### Acceptance Criteria

1. WHEN the Intent_Detector receives an utterance containing the word "present" as a whole word (case-insensitive), THE Intent_Detector SHALL return `mark_attendance`.
2. WHEN the Intent_Detector receives an utterance containing any of the following as whole words (case-insensitive): "percentage", "attendance", "how many classes", or "attended", THE Intent_Detector SHALL return `check_attendance`.
3. WHEN the Intent_Detector receives an utterance containing any of the following as whole words (case-insensitive): "search" or "find", THE Intent_Detector SHALL return `search_student`.
4. IF an utterance is empty or matches none of the keyword patterns, THEN THE Intent_Detector SHALL return `unknown`.
5. WHEN an utterance matches multiple intent patterns, THE Intent_Detector SHALL return the intent that appears first in the fixed evaluation order: `mark_attendance` → `check_attendance` → `search_student` → `unknown`.
6. WHEN the Intent_Detector receives a plain string input of 1–500 characters, THE Intent_Detector SHALL return exactly one of the four intent strings: `mark_attendance`, `check_attendance`, `search_student`, or `unknown`.

---

### Requirement 12: Template-Based Response Formatting

**User Story:** As a user, I want the system to speak and display formatted natural language responses based on database results, so that interactions feel conversational without requiring a third-party LLM.

#### Acceptance Criteria

1. WHEN the `check_attendance` intent is resolved and the Attendance_Percentage is retrieved, THE Response_Formatter SHALL produce the sentence: `"Your attendance is {percentage}%."` where `{percentage}` is the floor integer value.
2. WHEN the `search_student` intent is resolved and a matching student is found, THE Response_Formatter SHALL produce the sentence: `"{name}, Roll No. {roll_number}, Attendance: {percentage}%."` where `{percentage}` is the floor integer value from the student data.
3. WHEN the `search_student` intent is resolved and no matching student is found, THE Response_Formatter SHALL produce: `"No student found matching '{query}'."` where `{query}` is the search term passed to the formatter, truncated to 100 characters if longer.
4. WHEN the `mark_attendance` intent is resolved and attendance is successfully marked, THE Response_Formatter SHALL produce: `"Attendance marked successfully for {name}."` where `{name}` is the full name from the matched student record.
5. WHEN the `mark_attendance` intent is resolved but attendance was already marked today, THE Response_Formatter SHALL produce: `"You are already marked present today, {name}."` where `{name}` is the full name from the matched student record.
6. WHEN the `unknown` intent is returned, THE Response_Formatter SHALL produce: `"I didn't understand that. You can say 'present' to mark attendance, ask for your 'percentage', or 'search' for a student."`.
7. WHEN the Response_Formatter is called with an intent string, a data object (required for data-dependent intents, may be null for `unknown`), and an optional query string, THE Response_Formatter SHALL return a formatted string.
8. IF a data-dependent intent (`mark_attendance`, `check_attendance`, `search_student`) is received with a null or incomplete data object missing required fields, THEN THE Response_Formatter SHALL return: `"Sorry, I couldn't retrieve the data needed to complete your request."`.
9. IF the Response_Formatter receives an intent string that is not one of the four known values, THEN THE Response_Formatter SHALL return the `unknown` fallback response.

---

### Requirement 13: Text-to-Speech Output

**User Story:** As a user, I want the system to speak its responses aloud using the browser's built-in speech engine, so that the assistant feels interactive without any paid TTS API.

#### Acceptance Criteria

1. WHEN the Response_Formatter produces a response string, THE TTS_Engine SHALL speak the string aloud using `window.speechSynthesis.speak()` with a new `SpeechSynthesisUtterance` instance.
2. WHEN a new response string is ready to be spoken, THE TTS_Engine SHALL call `window.speechSynthesis.cancel()` before creating and speaking the new utterance, so that concurrent responses do not overlap.
3. WHILE the TTS_Engine is speaking (from utterance start until `onend` fires), THE Frontend SHALL display a visually distinct indicator (e.g., pulsing icon or "Speaking…" label) that is different from the idle state.
4. IF `window.speechSynthesis` is not available in the current browser, THEN THE Frontend SHALL display the formatted response as text only without throwing an unhandled error.
5. WHEN a `SpeechSynthesisUtterance` is created, THE TTS_Engine SHALL set its `lang` property to `"en-US"` before calling `speak()`.
6. WHEN the TTS_Engine finishes speaking (utterance `onend` event fires), THE Frontend SHALL remove the speaking indicator and return to the idle visual state.
7. IF the utterance `onerror` event fires, THEN THE Frontend SHALL remove the speaking indicator and display the response text as a fallback without throwing an unhandled error.
8. IF the response string passed to the TTS_Engine exceeds 5000 characters, THEN THE TTS_Engine SHALL truncate the string to 5000 characters before speaking.

---

### Requirement 14: Already-Marked Attendance Handling

**User Story:** As a student, I want the system to inform me clearly when my attendance has already been recorded for the day, so that I don't think the action failed.

#### Acceptance Criteria

1. WHEN the Backend processes a `POST /attendance/mark` request and determines that the identified student is already marked present for the current date, THE Backend SHALL return HTTP status 200 with `already_marked: true` in the response body.
2. WHEN the Frontend receives a response with `already_marked: true`, THE Frontend SHALL display a visually distinct informational message that is different from both the success state (attendance just marked) and the error state (verification failed), indicating attendance was already recorded today.
3. WHEN the Frontend receives a response with `already_marked: true`, THE Frontend SHALL pass the message `"You're already marked present today."` to the TTS_Engine for spoken output.
4. THE Frontend SHALL NOT treat `already_marked: true` as an error state and SHALL NOT display an error indicator for this case.

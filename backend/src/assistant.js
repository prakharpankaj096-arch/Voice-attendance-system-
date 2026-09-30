// AI Assistant — Intent Detection & Template Response Generation
//
// Per AI_ASSISTANT.md: simple keyword/pattern matching for intent detection,
// template strings for response generation. No LLM API calls needed.
//
// Intents:
//   mark_attendance   — "Prakhar Pankaj Present", "mark me present"
//   check_attendance  — "What is my attendance percentage?"
//   search_student    — "Search Prakhar Pankaj", "find roll number 21"
//   unknown           — fallback

/**
 * Detects the user's intent from transcribed text using keyword matching.
 *
 * @param {string} text - Transcribed speech or typed input
 * @returns {{ intent: string, extracted?: string }}
 *   intent: 'mark_attendance' | 'check_attendance' | 'search_student' | 'unknown'
 *   extracted: any name/query extracted from the text (best effort)
 */
function detectIntent(text) {
  if (!text || typeof text !== 'string') {
    return { intent: 'unknown', extracted: null };
  }

  const lower = text.toLowerCase().trim();

  // ── mark_attendance ──────────────────────────────────────────────
  // Trigger: contains "present", or explicit "mark" + "attendance"
  if (
    lower.includes('present') ||
    (lower.includes('mark') && lower.includes('attend'))
  ) {
    // Try to extract the name (everything before "present")
    const presentIdx = lower.indexOf('present');
    const namePart = presentIdx > 0 ? text.slice(0, presentIdx).trim() : null;
    return { intent: 'mark_attendance', extracted: namePart };
  }

  // ── check_attendance ─────────────────────────────────────────────
  // Trigger: "percentage", "attendance %", "how many classes", "my attendance"
  if (
    lower.includes('percentage') ||
    lower.includes('attendance %') ||
    lower.includes('how many class') ||
    lower.includes('how many lecture') ||
    (lower.includes('my') && lower.includes('attendance')) ||
    (lower.includes('check') && lower.includes('attendance'))
  ) {
    return { intent: 'check_attendance', extracted: null };
  }

  // ── search_student ───────────────────────────────────────────────
  // Trigger: "search", "find", "look up", "lookup"
  if (
    lower.includes('search') ||
    lower.includes('find') ||
    lower.includes('look up') ||
    lower.includes('lookup')
  ) {
    // Extract the query: text after the trigger keyword
    let query = null;
    for (const keyword of ['search', 'find', 'look up', 'lookup']) {
      const idx = lower.indexOf(keyword);
      if (idx >= 0) {
        query = text.slice(idx + keyword.length).trim();
        // Remove common filler words at the start
        query = query.replace(/^(for|student|the|a)\s+/i, '').trim();
        break;
      }
    }
    return { intent: 'search_student', extracted: query || null };
  }

  return { intent: 'unknown', extracted: null };
}

/**
 * Generates a natural-language response for the given intent and data.
 * Uses template strings — no LLM API calls.
 *
 * @param {string} intent - The detected intent
 * @param {object} data   - Context data for the response
 * @returns {string} The assistant's response text
 */
function generateResponse(intent, data = {}) {
  switch (intent) {
    // ── mark_attendance ──────────────────────────────────────────
    case 'mark_attendance': {
      if (data.matched && !data.already_marked) {
        return `I recognized you as ${data.student.name}. Voice verified (confidence: ${Math.round(data.score * 100)}%). Attendance marked successfully.`;
      }
      if (data.matched && data.already_marked) {
        return `I recognized you as ${data.student.name}. Voice verified (confidence: ${Math.round(data.score * 100)}%). You are already marked present today.`;
      }
      // Rejection
      const scoreText =
        data.score > 0
          ? ` (Best match score: ${data.score.toFixed(2)}, required: 0.75)`
          : '';
      return `I couldn't verify your voice with enough confidence${scoreText}. Please speak clearly and try again.`;
    }

    // ── check_attendance ─────────────────────────────────────────
    case 'check_attendance': {
      if (data.student && data.percentage !== undefined) {
        return `${data.student.name}, your attendance is ${data.percentage}%. You have attended ${data.classes_present} out of ${data.total_classes} classes.`;
      }
      if (data.percentage !== undefined) {
        return `Your attendance is ${data.percentage}%.`;
      }
      return "I couldn't find your attendance records. Please make sure you're enrolled in the system.";
    }

    // ── search_student ───────────────────────────────────────────
    case 'search_student': {
      if (!data.results || data.results.length === 0) {
        return 'No students found matching your search.';
      }
      if (data.results.length === 1) {
        const s = data.results[0];
        return `${s.name}, Roll No. ${s.roll_number}, Attendance: ${s.attendance_percentage}%.`;
      }
      // Multiple results
      const summaries = data.results.map(
        (s) => `${s.name} (Roll No. ${s.roll_number}, ${s.attendance_percentage}%)`
      );
      return `Found ${data.results.length} students: ${summaries.join('; ')}.`;
    }

    // ── unknown ──────────────────────────────────────────────────
    case 'unknown':
    default:
      return (
        "I didn't understand that. You can say things like " +
        '"Mark attendance", "What is my attendance percentage?", ' +
        'or "Search [student name]".'
      );
  }
}

module.exports = { detectIntent, generateResponse };

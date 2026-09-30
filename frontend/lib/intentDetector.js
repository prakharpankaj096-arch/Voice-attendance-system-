/**
 * AI Assistant — Intent Detector Module (Browser / Client-Side)
 * ==============================================================
 * Analyzes spoken or typed user input and classifies into one of four intents:
 *   1. mark_attendance  (Priority 1: input contains whole word "present")
 *   2. check_attendance (Priority 2: percentage, attendance, how many classes, attended)
 *   3. search_student   (Priority 3: search, find)
 *   4. unknown          (Priority 4: fallback)
 *
 * Uses whole-word matching via regex word boundaries (\b).
 */

const INTENTS = Object.freeze({
  MARK_ATTENDANCE: 'mark_attendance',
  CHECK_ATTENDANCE: 'check_attendance',
  SEARCH_STUDENT: 'search_student',
  UNKNOWN: 'unknown',
});

// Whole-word regex triggers
const REGEX_MARK_ATTENDANCE = /\bpresent\b/i;

const REGEX_CHECK_ATTENDANCE_PATTERNS = [
  /\bpercentage\b/i,
  /\battendance\b/i,
  /\bhow\s+many\s+classes\b/i,
  /\battended\b/i,
];

const REGEX_SEARCH_PATTERNS = [
  /\bsearch\b/i,
  /\bfind\b/i,
];

/**
 * Detects the user's intent according to priority rules:
 * 1. present -> mark_attendance
 * 2. check_attendance triggers -> check_attendance
 * 3. search_student triggers -> search_student
 * 4. unknown
 *
 * @param {string} text - User's spoken transcript or typed text
 * @returns {{ intent: string, extracted: string | null }}
 */
export function detectIntent(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { intent: INTENTS.UNKNOWN, extracted: null };
  }

  const raw = text.trim();

  // ── 1. Priority 1: mark_attendance (contains whole word "present") ──
  if (REGEX_MARK_ATTENDANCE.test(raw)) {
    // Extract potential name: any text before the whole word "present"
    const match = raw.match(/\bpresent\b/i);
    let extracted = null;
    if (match && match.index > 0) {
      const prefix = raw.slice(0, match.index).trim();
      if (prefix.length > 0) {
        // Strip common prefixes like "mark", "i am", "this is"
        extracted = prefix.replace(/^(mark\s+|i\s+am\s+|this\s+is\s+)/i, '').trim() || prefix;
      }
    }
    return { intent: INTENTS.MARK_ATTENDANCE, extracted };
  }

  // ── 2. Priority 2: check_attendance ──
  // Triggers: percentage, attendance, how many classes, attended
  for (const pattern of REGEX_CHECK_ATTENDANCE_PATTERNS) {
    if (pattern.test(raw)) {
      return { intent: INTENTS.CHECK_ATTENDANCE, extracted: null };
    }
  }

  // ── 3. Priority 3: search_student ──
  // Triggers: search, find
  for (const pattern of REGEX_SEARCH_PATTERNS) {
    const match = raw.match(pattern);
    if (match) {
      // Extract target query after the trigger keyword
      const afterTrigger = raw.slice(match.index + match[0].length).trim();
      let extracted = afterTrigger.replace(/^(?:for\s+|student\s+|the\s+|a\s+)+/i, '').trim();
      return { intent: INTENTS.SEARCH_STUDENT, extracted: extracted || null };
    }
  }

  // ── 4. Priority 4: unknown ──
  return { intent: INTENTS.UNKNOWN, extracted: null };
}

/**
 * Returns just the intent string ('mark_attendance', 'check_attendance', 'search_student', 'unknown')
 * @param {string} text
 * @returns {string}
 */
export function getIntent(text) {
  return detectIntent(text).intent;
}

export { INTENTS };
export default detectIntent;

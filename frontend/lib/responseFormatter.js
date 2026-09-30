/**
 * AI Assistant — Response Formatter Module (Browser / Client-Side)
 * ================================================================
 * Generates documented conversational response strings for each scenario.
 * Returns standard error fallback if required data is missing.
 */

export const RESPONSES = Object.freeze({
  UNKNOWN: "I didn't understand that. You can say 'present' to mark attendance, ask for your 'percentage', or 'search' for a student.",
  MISSING_DATA: "Sorry, I couldn't retrieve the data needed to complete your request.",
});

/**
 * Returns: "Your attendance is {percentage}%."
 * @param {number|string} percentage
 */
export function formatAttendancePercentage(percentage) {
  if (
    percentage === undefined ||
    percentage === null ||
    (typeof percentage !== 'number' && typeof percentage !== 'string') ||
    (typeof percentage === 'string' && percentage.trim() === '') ||
    Number.isNaN(Number(percentage))
  ) {
    return RESPONSES.MISSING_DATA;
  }
  return `Your attendance is ${percentage}%.`;
}

/**
 * Returns: "{name}, Roll No. {roll_number}, Attendance: {percentage}%."
 * @param {{ name: string, roll_number: string, percentage: number|string }} data
 */
export function formatSearchResult(data) {
  if (!data || typeof data !== 'object') {
    return RESPONSES.MISSING_DATA;
  }
  const { name, roll_number, percentage } = data;
  if (
    !name ||
    typeof name !== 'string' ||
    name.trim() === '' ||
    !roll_number ||
    (typeof roll_number === 'string' && roll_number.trim() === '') ||
    percentage === undefined ||
    percentage === null ||
    (typeof percentage === 'string' && percentage.trim() === '') ||
    Number.isNaN(Number(percentage))
  ) {
    return RESPONSES.MISSING_DATA;
  }
  return `${name}, Roll No. ${roll_number}, Attendance: ${percentage}%.`;
}

/**
 * Returns: "No student found matching '{query}'."
 * @param {string} query
 */
export function formatSearchNotFound(query) {
  if (!query || typeof query !== 'string' || query.trim() === '') {
    return RESPONSES.MISSING_DATA;
  }
  return `No student found matching '${query.trim()}'.`;
}

/**
 * Returns: "Attendance marked successfully for {name}."
 * @param {string} name
 */
export function formatSuccessfulAttendance(name) {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return RESPONSES.MISSING_DATA;
  }
  return `Attendance marked successfully for ${name.trim()}.`;
}

/**
 * Returns: "You are already marked present today, {name}."
 * @param {string} name
 */
export function formatAlreadyMarked(name) {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return RESPONSES.MISSING_DATA;
  }
  return `You are already marked present today, ${name.trim()}.`;
}

/**
 * Returns the fallback message for unrecognized input.
 */
export function formatUnknown() {
  return RESPONSES.UNKNOWN;
}

/**
 * Returns the standard missing data error message.
 */
export function formatMissingData() {
  return RESPONSES.MISSING_DATA;
}

/**
 * Unified response generator routing by type or intent.
 *
 * @param {string} type - 'attendance_percentage' | 'search_result' | 'search_not_found' |
 *                        'successful_attendance' | 'already_marked' | 'unknown'
 * @param {object} data - Context data
 * @returns {string}
 */
export function formatResponse(type, data = {}) {
  switch (type) {
    case 'attendance_percentage':
    case 'check_attendance':
    case 'percentage': {
      return formatAttendancePercentage(data?.percentage);
    }

    case 'search_result': {
      return formatSearchResult(data);
    }

    case 'search_not_found': {
      return formatSearchNotFound(data?.query);
    }

    case 'search_student': {
      if (data?.found === false || (Array.isArray(data?.results) && data.results.length === 0)) {
        return formatSearchNotFound(data?.query);
      }
      if (Array.isArray(data?.results) && data.results.length > 0) {
        return formatSearchResult(data.results[0]);
      }
      return formatSearchResult(data);
    }

    case 'successful_attendance':
    case 'attendance_success': {
      return formatSuccessfulAttendance(data?.name || data?.student?.name);
    }

    case 'already_marked': {
      return formatAlreadyMarked(data?.name || data?.student?.name);
    }

    case 'mark_attendance': {
      const studentName = data?.name || data?.student?.name;
      if (data?.already_marked) {
        return formatAlreadyMarked(studentName);
      }
      return formatSuccessfulAttendance(studentName);
    }

    case 'unknown':
      return formatUnknown();

    case 'missing_data':
      return formatMissingData();

    default:
      return formatUnknown();
  }
}

export default formatResponse;

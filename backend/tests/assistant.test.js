/**
 * AI Assistant Module Tests
 * =========================
 * Tests intent detection and response generation from backend/src/assistant.js.
 * Pure unit tests — no DB or network calls needed.
 */

const { detectIntent, generateResponse } = require('../src/assistant');

// ── Intent Detection ──────────────────────────────────────────────
describe('detectIntent', () => {
  test('detects mark_attendance for "[Name] Present"', () => {
    expect(detectIntent('Prakhar Pankaj Present').intent).toBe('mark_attendance');
    expect(detectIntent('John present').intent).toBe('mark_attendance');
    expect(detectIntent('Mark my attendance').intent).toBe('mark_attendance');
  });

  test('extracts name from "[Name] Present" pattern', () => {
    const result = detectIntent('Prakhar Pankaj Present');
    expect(result.intent).toBe('mark_attendance');
    expect(result.extracted).toBe('Prakhar Pankaj');
  });

  test('detects check_attendance for percentage queries', () => {
    expect(detectIntent('What is my attendance percentage?').intent).toBe('check_attendance');
    expect(detectIntent('Check my attendance').intent).toBe('check_attendance');
    expect(detectIntent('How many classes did I attend?').intent).toBe('check_attendance');
  });

  test('detects search_student for search queries', () => {
    expect(detectIntent('Search Prakhar').intent).toBe('search_student');
    expect(detectIntent('Find roll number 21').intent).toBe('search_student');
    expect(detectIntent('Look up Prakhar Pankaj').intent).toBe('search_student');
  });

  test('extracts query from search intent', () => {
    const result = detectIntent('Search Prakhar Pankaj');
    expect(result.intent).toBe('search_student');
    expect(result.extracted).toBe('Prakhar Pankaj');
  });

  test('returns unknown for unrecognized input', () => {
    expect(detectIntent('Hello world').intent).toBe('unknown');
    expect(detectIntent('What is the weather?').intent).toBe('unknown');
  });

  test('handles null/empty input gracefully', () => {
    expect(detectIntent(null).intent).toBe('unknown');
    expect(detectIntent('').intent).toBe('unknown');
    expect(detectIntent(undefined).intent).toBe('unknown');
  });
});

// ── Response Generation ───────────────────────────────────────────
describe('generateResponse', () => {
  test('generates verified attendance message', () => {
    const msg = generateResponse('mark_attendance', {
      matched: true,
      already_marked: false,
      student: { name: 'Prakhar Pankaj' },
      score: 0.87,
    });
    expect(msg).toContain('Prakhar Pankaj');
    expect(msg).toContain('87%');
    expect(msg).toContain('successfully');
  });

  test('generates already-marked message', () => {
    const msg = generateResponse('mark_attendance', {
      matched: true,
      already_marked: true,
      student: { name: 'Prakhar' },
      score: 0.9,
    });
    expect(msg).toContain('already');
  });

  test('generates rejection message', () => {
    const msg = generateResponse('mark_attendance', {
      matched: false,
      score: 0.6,
    });
    expect(msg).toContain("couldn't verify");
    expect(msg).toContain('0.60');
  });

  test('generates attendance percentage message', () => {
    const msg = generateResponse('check_attendance', {
      student: { name: 'Prakhar' },
      percentage: 85,
      classes_present: 17,
      total_classes: 20,
    });
    expect(msg).toContain('85%');
    expect(msg).toContain('17');
    expect(msg).toContain('20');
  });

  test('generates search results message', () => {
    const msg = generateResponse('search_student', {
      results: [
        { name: 'Prakhar', roll_number: '21', attendance_percentage: 90 },
      ],
    });
    expect(msg).toContain('Prakhar');
    expect(msg).toContain('21');
    expect(msg).toContain('90%');
  });

  test('generates unknown fallback message', () => {
    const msg = generateResponse('unknown');
    expect(msg).toContain("didn't understand");
  });
});

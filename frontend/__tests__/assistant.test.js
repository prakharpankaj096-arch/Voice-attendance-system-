/**
 * TASK 7: AI Assistant Library Modules Test Suite
 * ================================================
 * Tests:
 *   - intentDetector.js
 *   - responseFormatter.js
 *   - ttsEngine.js
 *
 * Includes:
 *   - Property-based tests (fast-check)
 *   - Unit tests for intent totality, keyword detection, priority, response templates,
 *     missing data fallbacks, and TTS engine with browser API mocking.
 */

import fc from 'fast-check';
import { detectIntent, getIntent, INTENTS } from '../lib/intentDetector';
import {
  formatAttendancePercentage,
  formatSearchResult,
  formatSearchNotFound,
  formatSuccessfulAttendance,
  formatAlreadyMarked,
  formatUnknown,
  formatMissingData,
  formatResponse,
  RESPONSES,
} from '../lib/responseFormatter';
import {
  speak,
  stopSpeaking,
  isSpeaking,
  isTtsSupported,
} from '../lib/ttsEngine';

describe('TASK 7: AI Assistant Library Modules', () => {
  // ════════════════════════════════════════════════════════════════
  // 1. INTENT DETECTOR TESTS
  // ════════════════════════════════════════════════════════════════
  describe('intentDetector', () => {
    describe('Property-Based Tests (fast-check)', () => {
      test('Intent totality: detectIntent never throws and always returns a valid intent', () => {
        fc.assert(
          fc.property(fc.anything(), (input) => {
            const result = detectIntent(input);
            expect(result).toHaveProperty('intent');
            expect(Object.values(INTENTS)).toContain(result.intent);
          }),
          { numRuns: 300 }
        );
      });

      test('Isolated keyword detection: any text containing whole word "present" triggers mark_attendance', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 0, maxLength: 30 }).map((s) => s.replace(/present/gi, '')),
            fc.string({ minLength: 0, maxLength: 30 }).map((s) => s.replace(/present/gi, '')),
            (prefix, suffix) => {
              const text = `${prefix} present ${suffix}`.trim();
              const result = detectIntent(text);
              expect(result.intent).toBe(INTENTS.MARK_ATTENDANCE);
            }
          ),
          { numRuns: 100 }
        );
      });

      test('Priority invariant: "present" always wins over check_attendance and search triggers', () => {
        const checkWords = ['percentage', 'attendance', 'how many classes', 'attended'];
        const searchWords = ['search', 'find'];

        fc.assert(
          fc.property(
            fc.constantFrom(...checkWords),
            fc.constantFrom(...searchWords),
            (checkWord, searchWord) => {
              const text = `I want to ${searchWord} my ${checkWord} and I am present today`;
              const result = detectIntent(text);
              expect(result.intent).toBe(INTENTS.MARK_ATTENDANCE);
            }
          ),
          { numRuns: 50 }
        );
      });

      test('Priority invariant: check_attendance triggers always win over search triggers', () => {
        const checkWords = ['percentage', 'attendance', 'how many classes', 'attended'];
        const searchWords = ['search', 'find'];

        fc.assert(
          fc.property(
            fc.constantFrom(...checkWords),
            fc.constantFrom(...searchWords),
            (checkWord, searchWord) => {
              const text = `Please ${searchWord} my ${checkWord}`;
              const result = detectIntent(text);
              expect(result.intent).toBe(INTENTS.CHECK_ATTENDANCE);
            }
          ),
          { numRuns: 50 }
        );
      });
    });

    describe('Unit Tests', () => {
      test('detects mark_attendance when text contains whole word "present"', () => {
        expect(detectIntent('Prakhar Pankaj Present').intent).toBe('mark_attendance');
        expect(detectIntent('John present').intent).toBe('mark_attendance');
        expect(detectIntent('present').intent).toBe('mark_attendance');
        expect(detectIntent('I am PRESENT here').intent).toBe('mark_attendance');
        expect(getIntent('present')).toBe('mark_attendance');
      });

      test('whole-word matching: does not falsely trigger on words containing "present" as a substring', () => {
        expect(detectIntent('This is a great presentation').intent).not.toBe('mark_attendance');
        expect(detectIntent('The representation is clear').intent).not.toBe('mark_attendance');
        expect(detectIntent('presenter was good').intent).not.toBe('mark_attendance');
      });

      test('extracts student name from "[Name] Present" pattern', () => {
        const res = detectIntent('Prakhar Pankaj Present');
        expect(res.intent).toBe('mark_attendance');
        expect(res.extracted).toBe('Prakhar Pankaj');
      });

      test('detects check_attendance for all documented triggers', () => {
        expect(detectIntent('What is my attendance percentage?').intent).toBe('check_attendance');
        expect(detectIntent('Show my attendance').intent).toBe('check_attendance');
        expect(detectIntent('how many classes have I attended').intent).toBe('check_attendance');
        expect(detectIntent('how many classes did I miss').intent).toBe('check_attendance');
        expect(detectIntent('total attended sessions').intent).toBe('check_attendance');
      });

      test('detects search_student for search and find keywords', () => {
        const res1 = detectIntent('Search Prakhar Pankaj');
        expect(res1.intent).toBe('search_student');
        expect(res1.extracted).toBe('Prakhar Pankaj');

        const res2 = detectIntent('find roll number 21');
        expect(res2.intent).toBe('search_student');
        expect(res2.extracted).toBe('roll number 21');

        const res3 = detectIntent('search for student Alice');
        expect(res3.intent).toBe('search_student');
        expect(res3.extracted).toBe('Alice');
      });

      test('evaluates priority strictly: present > check_attendance > search_student > unknown', () => {
        // "present" + "attendance" -> mark_attendance
        expect(detectIntent('Mark my attendance, I am present').intent).toBe('mark_attendance');

        // "present" + "search" -> mark_attendance
        expect(detectIntent('Search present').intent).toBe('mark_attendance');

        // "attendance" + "search" -> check_attendance
        expect(detectIntent('Search my attendance percentage').intent).toBe('check_attendance');

        // "find" + "attendance" -> check_attendance
        expect(detectIntent('Find my attendance').intent).toBe('check_attendance');
      });

      test('returns unknown for unrecognized or empty inputs', () => {
        expect(detectIntent('tell me a joke').intent).toBe('unknown');
        expect(detectIntent('hello good morning').intent).toBe('unknown');
        expect(detectIntent('').intent).toBe('unknown');
        expect(detectIntent('   ').intent).toBe('unknown');
        expect(detectIntent(null).intent).toBe('unknown');
        expect(detectIntent(undefined).intent).toBe('unknown');
        expect(detectIntent(12345).intent).toBe('unknown');
      });
    });
  });

  // ════════════════════════════════════════════════════════════════
  // 2. RESPONSE FORMATTER TESTS
  // ════════════════════════════════════════════════════════════════
  describe('responseFormatter', () => {
    describe('Property-Based Tests (fast-check)', () => {
      test('Attendance percentage formatting: always formats valid numeric percentages', () => {
        fc.assert(
          fc.property(fc.integer({ min: 0, max: 100 }), (percentage) => {
            const res = formatAttendancePercentage(percentage);
            expect(res).toBe(`Your attendance is ${percentage}%.`);
          }),
          { numRuns: 100 }
        );
      });

      test('Missing data resilience: invalid/missing inputs to formatters always return standard missing data message', () => {
        fc.assert(
          fc.property(
            fc.constantFrom(null, undefined, NaN, ''),
            (invalidVal) => {
              expect(formatAttendancePercentage(invalidVal)).toBe(RESPONSES.MISSING_DATA);
              expect(formatSearchResult({ name: invalidVal, roll_number: '12', percentage: 50 })).toBe(RESPONSES.MISSING_DATA);
              expect(formatSearchNotFound(invalidVal)).toBe(RESPONSES.MISSING_DATA);
              expect(formatSuccessfulAttendance(invalidVal)).toBe(RESPONSES.MISSING_DATA);
              expect(formatAlreadyMarked(invalidVal)).toBe(RESPONSES.MISSING_DATA);
            }
          ),
          { numRuns: 20 }
        );
      });
    });

    describe('Unit Tests', () => {
      test('formats attendance percentage response correctly', () => {
        expect(formatAttendancePercentage(84)).toBe('Your attendance is 84%.');
        expect(formatAttendancePercentage(100)).toBe('Your attendance is 100%.');
        expect(formatAttendancePercentage(0)).toBe('Your attendance is 0%.');
      });

      test('formats search result response correctly', () => {
        expect(
          formatSearchResult({
            name: 'Prakhar Pankaj',
            roll_number: '21',
            percentage: 84,
          })
        ).toBe('Prakhar Pankaj, Roll No. 21, Attendance: 84%.');
      });

      test('formats search not found response correctly', () => {
        expect(formatSearchNotFound('John Doe')).toBe("No student found matching 'John Doe'.");
      });

      test('formats successful attendance response correctly', () => {
        expect(formatSuccessfulAttendance('Prakhar Pankaj')).toBe(
          'Attendance marked successfully for Prakhar Pankaj.'
        );
      });

      test('formats already marked response correctly', () => {
        expect(formatAlreadyMarked('Prakhar Pankaj')).toBe(
          'You are already marked present today, Prakhar Pankaj.'
        );
      });

      test('formats unknown response correctly', () => {
        expect(formatUnknown()).toBe(
          "I didn't understand that. You can say 'present' to mark attendance, ask for your 'percentage', or 'search' for a student."
        );
      });

      test('formats missing required data fallback message', () => {
        expect(formatMissingData()).toBe(
          "Sorry, I couldn't retrieve the data needed to complete your request."
        );
      });

      test('formatResponse router handles all documented intents correctly', () => {
        expect(formatResponse('attendance_percentage', { percentage: 75 })).toBe(
          'Your attendance is 75%.'
        );
        expect(
          formatResponse('search_result', {
            name: 'Alice',
            roll_number: 'CS-01',
            percentage: 90,
          })
        ).toBe('Alice, Roll No. CS-01, Attendance: 90%.');
        expect(formatResponse('search_not_found', { query: 'Bob' })).toBe(
          "No student found matching 'Bob'."
        );
        expect(formatResponse('successful_attendance', { name: 'Alice' })).toBe(
          'Attendance marked successfully for Alice.'
        );
        expect(formatResponse('already_marked', { name: 'Alice' })).toBe(
          'You are already marked present today, Alice.'
        );
        expect(formatResponse('unknown')).toBe(RESPONSES.UNKNOWN);
      });

      test('returns missing data error when router is missing required data', () => {
        expect(formatResponse('attendance_percentage', {})).toBe(RESPONSES.MISSING_DATA);
        expect(formatResponse('search_result', {})).toBe(RESPONSES.MISSING_DATA);
        expect(formatResponse('search_not_found', {})).toBe(RESPONSES.MISSING_DATA);
        expect(formatResponse('successful_attendance', {})).toBe(RESPONSES.MISSING_DATA);
        expect(formatResponse('already_marked', {})).toBe(RESPONSES.MISSING_DATA);
      });
    });
  });

  // ════════════════════════════════════════════════════════════════
  // 3. TTS ENGINE TESTS
  // ════════════════════════════════════════════════════════════════
  describe('ttsEngine', () => {
    let originalSpeechSynthesis;
    let originalUtterance;
    let mockSynth;
    let spokenUtterances = [];

    beforeEach(() => {
      spokenUtterances = [];
      mockSynth = {
        speaking: false,
        cancel: jest.fn(() => {
          mockSynth.speaking = false;
        }),
        speak: jest.fn((utterance) => {
          mockSynth.speaking = true;
          spokenUtterances.push(utterance);
        }),
      };

      originalSpeechSynthesis = window.speechSynthesis;
      originalUtterance = window.SpeechSynthesisUtterance;

      window.speechSynthesis = mockSynth;
      window.SpeechSynthesisUtterance = function (text) {
        this.text = text;
        this.lang = 'en-US';
        this.rate = 1.0;
        this.pitch = 1.0;
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
      };
    });

    afterEach(() => {
      window.speechSynthesis = originalSpeechSynthesis;
      window.SpeechSynthesisUtterance = originalUtterance;
    });

    test('isTtsSupported returns true when browser APIs are available', () => {
      expect(isTtsSupported()).toBe(true);
    });

    test('isTtsSupported returns false when speechSynthesis is missing', () => {
      delete window.speechSynthesis;
      expect(isTtsSupported()).toBe(false);
    });

    test('cancels previous speech before starting new speech', () => {
      speak('First sentence');
      expect(mockSynth.cancel).toHaveBeenCalledTimes(1);
      expect(mockSynth.speak).toHaveBeenCalledTimes(1);

      speak('Second sentence');
      expect(mockSynth.cancel).toHaveBeenCalledTimes(2);
      expect(mockSynth.speak).toHaveBeenCalledTimes(2);
    });

    test('sets default language to en-US', () => {
      speak('Hello world');
      expect(spokenUtterances[0].lang).toBe('en-US');
    });

    test('truncates extremely long text to 5000 characters', () => {
      const veryLongText = 'A'.repeat(6000);
      speak(veryLongText);

      expect(spokenUtterances[0].text.length).toBe(5000);
      expect(spokenUtterances[0].text).toBe('A'.repeat(5000));
    });

    test('Property test: text length passed to SpeechSynthesisUtterance never exceeds 5000 chars', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 8000 }), (text) => {
          spokenUtterances = [];
          speak(text);
          if (spokenUtterances.length > 0) {
            expect(spokenUtterances[0].text.length).toBeLessThanOrEqual(5000);
          }
        }),
        { numRuns: 50 }
      );
    });

    test('stopSpeaking calls cancel', () => {
      stopSpeaking();
      expect(mockSynth.cancel).toHaveBeenCalled();
    });

    test('isSpeaking reflects synthesizer speaking state', () => {
      mockSynth.speaking = false;
      expect(isSpeaking()).toBe(false);

      mockSynth.speaking = true;
      expect(isSpeaking()).toBe(true);
    });

    test('supports completion and error callbacks', () => {
      const onEndMock = jest.fn();
      const onErrorMock = jest.fn();

      speak('Testing callbacks', {
        onEnd: onEndMock,
        onError: onErrorMock,
      });

      const utterance = spokenUtterances[0];
      utterance.onend({ type: 'end' });
      expect(onEndMock).toHaveBeenCalledWith({ type: 'end' });

      utterance.onerror({ type: 'error' });
      expect(onErrorMock).toHaveBeenCalledWith({ type: 'error' });
    });

    test('gracefully handles missing SpeechSynthesis without throwing', () => {
      delete window.speechSynthesis;
      const onError = jest.fn();

      const result = speak('Hello', { onError });
      expect(result).toBe(false);
      expect(onError).toHaveBeenCalled();
      expect(() => stopSpeaking()).not.toThrow();
      expect(isSpeaking()).toBe(false);
    });
  });
});

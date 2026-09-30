/**
 * Property-Based Tests — Backend AI Assistant & Helpers
 * =====================================================
 * Uses fast-check to verify invariants across arbitrary string inputs.
 */

const fc = require('fast-check');
const { detectIntent, generateResponse } = require('../src/assistant');

describe('AI Assistant Property-Based Tests (fast-check)', () => {
  test('detectIntent never throws and always returns an object with valid intent string for any input', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const result = detectIntent(text);
        expect(typeof result).toBe('object');
        expect(result).not.toBeNull();
        expect(typeof result.intent).toBe('string');
        expect(['mark_attendance', 'check_attendance', 'search_student', 'unknown']).toContain(
          result.intent
        );
      }),
      { numRuns: 100 }
    );
  });

  test('generateResponse never throws and always returns a non-empty string for arbitrary data', () => {
    const intents = ['mark_attendance', 'check_attendance', 'search_student', 'unknown'];
    fc.assert(
      fc.property(
        fc.constantFrom(...intents),
        fc.record({
          matched: fc.boolean(),
          already_marked: fc.boolean(),
          score: fc.float({ min: 0, max: 1 }),
          percentage: fc.integer({ min: 0, max: 100 }),
          classes_present: fc.integer({ min: 0, max: 50 }),
          total_classes: fc.integer({ min: 0, max: 50 }),
          student: fc.record({
            id: fc.uuid(),
            name: fc.string(),
            roll_number: fc.string(),
          }),
        }),
        (intent, data) => {
          const response = generateResponse(intent, data);
          expect(typeof response).toBe('string');
          expect(response.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

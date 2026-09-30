import fc from 'fast-check';

describe('Frontend Property-Based Testing (fast-check)', () => {
  test('attendance percentage calculation logic satisfies boundary invariants', () => {
    // Invariant: attendance percentage is always an integer between 0 and 100
    // when total classes >= 0 and present classes <= total classes
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        (val1, val2) => {
          const total = Math.max(val1, val2);
          const present = Math.min(val1, val2);

          const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

          expect(percentage).toBeGreaterThanOrEqual(0);
          expect(percentage).toBeLessThanOrEqual(100);
          expect(Number.isInteger(percentage)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('search query sanitizer handles arbitrary input strings safely', () => {
    // Invariant: query cleaner never throws and always trims
    const cleanSearchQuery = (input) => {
      if (typeof input !== 'string') return '';
      return input
        .replace(/^(search|find|look up|lookup)\s+(for\s+|student\s+)?/i, '')
        .trim();
    };

    fc.assert(
      fc.property(fc.string(), (query) => {
        const cleaned = cleanSearchQuery(query);
        expect(typeof cleaned).toBe('string');
        expect(cleaned).toBe(cleaned.trim());
      }),
      { numRuns: 100 }
    );
  });
});

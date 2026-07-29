const { branchDateKey } = require('../../src/services/sequenceService');

/**
 * Daily token numbering resets at the BRANCH's local midnight, not the
 * server's — so a branch in Tokyo rolls over correctly even on a UTC server.
 */
describe('branchDateKey (timezone-correct day boundary)', () => {
  test('formats as YYYY-MM-DD', () => {
    expect(branchDateKey('UTC', new Date('2026-07-20T10:00:00Z'))).toBe('2026-07-20');
  });

  test('a UTC evening is already the next day in Tokyo', () => {
    const t = new Date('2026-07-20T23:00:00Z'); // 08:00 next day in Tokyo
    expect(branchDateKey('UTC', t)).toBe('2026-07-20');
    expect(branchDateKey('Asia/Tokyo', t)).toBe('2026-07-21');
  });

  test('a UTC early morning is still the previous day in Los Angeles', () => {
    const t = new Date('2026-07-20T05:00:00Z'); // 22:00 previous day in LA
    expect(branchDateKey('America/Los_Angeles', t)).toBe('2026-07-19');
  });
});

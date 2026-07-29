const { heuristic } = require('../../src/services/etaService');

/**
 * The cold-start ETA formula (used before the org's model is trained). It must
 * behave sensibly: zero at the front, scaling with the line, shared across
 * open counters, and discounted for priority.
 */
describe('ETA heuristic', () => {
  test('the person at the front waits ~0', () => {
    expect(heuristic({ queuePosition: 1, avgServiceSeconds: 300, openCounters: 1, isPriority: false })).toBe(0);
  });

  test('scales linearly with position', () => {
    // (5 - 1) * 300 / 1
    expect(heuristic({ queuePosition: 5, avgServiceSeconds: 300, openCounters: 1 })).toBe(1200);
  });

  test('divides work across open counters', () => {
    expect(heuristic({ queuePosition: 5, avgServiceSeconds: 300, openCounters: 2 })).toBe(600);
  });

  test('priority roughly halves the wait', () => {
    expect(heuristic({ queuePosition: 5, avgServiceSeconds: 300, openCounters: 1, isPriority: true })).toBe(600);
  });

  test('never returns a negative ETA', () => {
    expect(heuristic({ queuePosition: 0, avgServiceSeconds: 300, openCounters: 1 })).toBe(0);
  });
});

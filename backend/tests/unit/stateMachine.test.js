const { canTransition, TRANSITIONS } = require('../../src/services/tokenStateMachine');

/**
 * The token lifecycle is the backbone of the whole platform — an illegal
 * transition would corrupt a queue. These lock the legal graph in place.
 */
describe('token state machine — legality', () => {
  test('allows every intended transition', () => {
    expect(canTransition('waiting', 'serving')).toBe(true);
    expect(canTransition('waiting', 'cancelled')).toBe(true);
    expect(canTransition('serving', 'completed')).toBe(true);
    expect(canTransition('serving', 'held')).toBe(true);
    expect(canTransition('serving', 'skipped')).toBe(true);
    expect(canTransition('held', 'serving')).toBe(true);
    expect(canTransition('held', 'missed')).toBe(true);
    expect(canTransition('skipped', 'serving')).toBe(true);
    expect(canTransition('skipped', 'missed')).toBe(true);
  });

  test('rejects illegal jumps', () => {
    expect(canTransition('waiting', 'completed')).toBe(false); // can't skip serving
    expect(canTransition('waiting', 'missed')).toBe(false);
    expect(canTransition('serving', 'cancelled')).toBe(false);
    expect(canTransition('completed', 'serving')).toBe(false); // can't revive
    expect(canTransition('missed', 'serving')).toBe(false);
    expect(canTransition('cancelled', 'waiting')).toBe(false);
  });

  test('terminal states have no outgoing transitions', () => {
    for (const s of ['completed', 'missed', 'cancelled']) {
      expect(TRANSITIONS[s]).toEqual([]);
    }
  });

  test('unknown states never transition', () => {
    expect(canTransition('bogus', 'serving')).toBe(false);
  });
});

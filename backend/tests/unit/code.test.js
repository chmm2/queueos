const { initials, roomCode, buildCounterCode } = require('../../src/services/codeService');

/**
 * Counter codes get printed above a desk and announced on the display, so they
 * must be readable, stable, and unique across the whole organization.
 */
describe('counter code generation', () => {
  test('builds org-branch-room-number from the names', () => {
    const code = buildCounterCode({
      orgName: 'Demo City Clinic',
      branchName: 'Main Hospital',
      room: { name: 'Registration', code: 'REG' },
    });
    expect(code).toBe('DCC-MH-REG-01');
  });

  test('never reuses a code that is already taken', () => {
    const args = {
      orgName: 'Demo City Clinic',
      branchName: 'Main Hospital',
      room: { name: 'Registration', code: 'REG' },
    };
    const first = buildCounterCode(args);
    const second = buildCounterCode({ ...args, existingCodes: [first] });
    const third = buildCounterCode({ ...args, existingCodes: [first, second] });
    expect(new Set([first, second, third]).size).toBe(3);
    expect(third).toBe('DCC-MH-REG-03');
  });

  test('rooms in the same branch get distinct prefixes', () => {
    const base = { orgName: 'Demo City Clinic', branchName: 'Main Hospital' };
    const reg = buildCounterCode({ ...base, room: { name: 'Registration', code: 'REG' } });
    const pharm = buildCounterCode({ ...base, room: { name: 'Pharmacy', code: 'PHAR' } });
    expect(reg).not.toBe(pharm);
    expect(pharm).toContain('PHAR');
  });

  test('falls back to the room name when no short code is set', () => {
    expect(roomCode({ name: 'Diagnostics' })).toBe('DIA');
    expect(roomCode({ name: 'Lab', code: 'LB' })).toBe('LB');
  });

  test('initials handle single and multi-word names', () => {
    expect(initials('Demo City Clinic')).toBe('DCC');
    expect(initials('Pharmacy')).toBe('PHA');
    expect(initials('Main Hospital', 2)).toBe('MH');
  });
});

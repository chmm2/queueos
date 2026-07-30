/**
 * Two roles, deliberately — the raw names don't tell a new user what they can
 * do, so every surface shows the friendly label plus a plain-English summary.
 */
export const ROLE_INFO = {
  Admin: {
    label: 'Administrator',
    tagline: 'Sets up and runs the organization',
    can: 'Create branches, configure departments, rooms and counters, manage staff, and view analytics.',
  },
  Staff: {
    label: 'Counter Staff',
    tagline: 'Serves customers at a counter',
    can: 'Call the next customer, then hold, skip, transfer or complete them at their counter.',
  },
};

export function roleInfo(role) {
  return ROLE_INFO[role] || ROLE_INFO.Staff;
}

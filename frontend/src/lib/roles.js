/**
 * Plain-English role descriptions. The raw role names (Admin / Operator /
 * Staff) don't tell a new user what they can actually do — this maps each to a
 * friendly label and a one-line "what you can do", shown in the sidebar,
 * Overview, and the staff-invite form.
 */
export const ROLE_INFO = {
  Admin: {
    label: 'Administrator',
    tagline: 'Runs the whole organization',
    can: 'Set up branches, services and counters, invite staff, and see analytics across every branch.',
  },
  Operator: {
    label: 'Branch Manager',
    tagline: 'Runs one branch day-to-day',
    can: 'Open and assign counters, manage staff, and serve the queue for their branch.',
  },
  Staff: {
    label: 'Front-desk Agent',
    tagline: 'Serves customers at a counter',
    can: 'Call the next person, then hold, skip, or complete them at their counter.',
  },
  User: {
    label: 'Customer',
    tagline: 'Joins the queue',
    can: 'Get a token and track their place in line.',
  },
};

export function roleInfo(role) {
  return ROLE_INFO[role] || ROLE_INFO.Staff;
}

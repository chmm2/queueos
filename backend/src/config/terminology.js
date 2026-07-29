/**
 * Industry-adaptive vocabulary. "Counter" is right for a bank but wrong for a
 * hospital (Room), a restaurant (Station) or a government office (Window).
 * This maps each industry to the words its staff actually use, so one
 * codebase reads naturally for everyone.
 *
 * Stored on the Organization at signup (editable later) and sent to the
 * frontend so the whole UI relabels itself.
 */
const DEFAULT = {
  counter: 'Counter',
  counterPlural: 'Counters',
  service: 'Service',
  servicePlural: 'Services',
  customer: 'Customer',
  customerPlural: 'Customers',
  token: 'Token',
};

const BY_INDUSTRY = {
  hospital: { counter: 'Room', counterPlural: 'Rooms', service: 'Department', servicePlural: 'Departments', customer: 'Patient', customerPlural: 'Patients', token: 'Token' },
  bank: { counter: 'Counter', counterPlural: 'Counters', service: 'Service', servicePlural: 'Services', customer: 'Customer', customerPlural: 'Customers', token: 'Token' },
  restaurant: { counter: 'Station', counterPlural: 'Stations', service: 'Counter', servicePlural: 'Counters', customer: 'Guest', customerPlural: 'Guests', token: 'Order' },
  government: { counter: 'Window', counterPlural: 'Windows', service: 'Service', servicePlural: 'Services', customer: 'Applicant', customerPlural: 'Applicants', token: 'Token' },
  pharmacy: { counter: 'Counter', counterPlural: 'Counters', service: 'Service', servicePlural: 'Services', customer: 'Customer', customerPlural: 'Customers', token: 'Token' },
  salon: { counter: 'Station', counterPlural: 'Stations', service: 'Service', servicePlural: 'Services', customer: 'Client', customerPlural: 'Clients', token: 'Token' },
  retail: { counter: 'Counter', counterPlural: 'Counters', service: 'Service', servicePlural: 'Services', customer: 'Customer', customerPlural: 'Customers', token: 'Token' },
  education: { counter: 'Desk', counterPlural: 'Desks', service: 'Service', servicePlural: 'Services', customer: 'Student', customerPlural: 'Students', token: 'Token' },
};

function terminologyFor(industry) {
  return { ...DEFAULT, ...(BY_INDUSTRY[industry] || {}) };
}

module.exports = { terminologyFor, DEFAULT };

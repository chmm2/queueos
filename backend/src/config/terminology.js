/**
 * Industry-adaptive wording for the CUSTOMER-facing surfaces only.
 *
 * The admin console deliberately uses fixed, concrete structural names —
 * Branch, Department, Room, Counter — because those are now real, distinct
 * entities in the model and renaming them per industry would make the
 * hierarchy harder to reason about, not easier.
 *
 * What genuinely does vary is what an organization calls the *person in the
 * queue*: a hospital has Patients, a restaurant has Guests, a salon has
 * Clients. That's what this map is for.
 */
const DEFAULT = {
  customer: 'Customer',
  customerPlural: 'Customers',
  token: 'Token',
};

const BY_INDUSTRY = {
  hospital:   { customer: 'Patient',   customerPlural: 'Patients',   token: 'Token' },
  bank:       { customer: 'Customer',  customerPlural: 'Customers',  token: 'Token' },
  restaurant: { customer: 'Guest',     customerPlural: 'Guests',     token: 'Order' },
  government: { customer: 'Applicant', customerPlural: 'Applicants', token: 'Token' },
  pharmacy:   { customer: 'Customer',  customerPlural: 'Customers',  token: 'Token' },
  salon:      { customer: 'Client',    customerPlural: 'Clients',    token: 'Token' },
  retail:     { customer: 'Customer',  customerPlural: 'Customers',  token: 'Token' },
  education:  { customer: 'Student',   customerPlural: 'Students',   token: 'Token' },
};

function terminologyFor(industry) {
  return { ...DEFAULT, ...(BY_INDUSTRY[industry] || {}) };
}

module.exports = { terminologyFor, DEFAULT };

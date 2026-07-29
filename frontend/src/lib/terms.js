import { useAuthStore } from '../store/authStore';

/**
 * Industry-adaptive vocabulary for the UI. Reads the terminology the backend
 * seeded for this org (Room / Station / Window / Counter, Patient / Guest /
 * Client / Customer, ...) so every screen speaks the org's language.
 * Falls back to generic words if the org hasn't loaded yet.
 */
const FALLBACK = {
  counter: 'Counter',
  counterPlural: 'Counters',
  service: 'Service',
  servicePlural: 'Services',
  customer: 'Customer',
  customerPlural: 'Customers',
  token: 'Token',
};

export function useTerms() {
  const org = useAuthStore((s) => s.organization);
  return { ...FALLBACK, ...(org?.terminology || {}) };
}

// Non-hook access for places that aren't React components.
export function getTerms() {
  return { ...FALLBACK, ...(useAuthStore.getState().organization?.terminology || {}) };
}

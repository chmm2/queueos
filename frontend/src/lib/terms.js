import { useAuthStore } from '../store/authStore';

/**
 * What this organization calls the person in the queue (Patient / Guest /
 * Client / Applicant). Structural names — Branch, Department, Room, Counter —
 * are intentionally fixed everywhere, because they're now distinct entities
 * and relabelling them per industry would obscure the hierarchy.
 */
const FALLBACK = { customer: 'Customer', customerPlural: 'Customers', token: 'Token' };

export function useTerms() {
  const org = useAuthStore((s) => s.organization);
  return { ...FALLBACK, ...(org?.terminology || {}) };
}

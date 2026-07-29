import { create } from 'zustand';

/**
 * Tiny global toast queue. Any component can call
 *   toast.success('Service added')  /  toast.error('Could not save')
 * and the <Toaster/> mounted in the layout renders + auto-dismisses it.
 * Feedback everywhere, no prop drilling.
 */
let seq = 0;

export const useToastStore = create((set) => ({
  toasts: [],
  push: (message, type = 'info') => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Convenience helpers usable outside React render (e.g. in event handlers).
export const toast = {
  success: (m) => useToastStore.getState().push(m, 'success'),
  error: (m) => useToastStore.getState().push(m, 'error'),
  info: (m) => useToastStore.getState().push(m, 'info'),
};

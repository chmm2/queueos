import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Single source of truth for the logged-in staff/operator/admin. Stores the
 * access + refresh tokens and the user (with their organization). Route
 * guards and UI read `role` from here; the JWTs stay opaque to the rest of
 * the app.
 *
 * `token` mirrors `accessToken` so the axios/socket clients that read
 * `state.token` keep working unchanged.
 */
export const useAuthStore = create(
  persist(
    (set) => ({
      token: null, // == accessToken (compat alias)
      accessToken: null,
      refreshToken: null,
      user: null,
      organization: null,

      login: ({ accessToken, refreshToken, user, organization }) =>
        set({
          token: accessToken,
          accessToken,
          refreshToken,
          user,
          organization: organization || user?.organization || null,
        }),

      setTokens: ({ accessToken, refreshToken }) =>
        set({ token: accessToken, accessToken, refreshToken }),

      logout: () => set({ token: null, accessToken: null, refreshToken: null, user: null, organization: null }),

      hasRole: (...roles) => (state) => roles.includes(state.user?.role),
    }),
    { name: 'auth-storage' }
  )
);

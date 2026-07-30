import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Who is signed in. There are two kinds of principal:
 *
 *   principal: 'user'    an administrator, signed in as themselves
 *   principal: 'counter' a machine at a desk, signed in as the counter itself
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
      principal: null, // 'user' | 'counter'
      user: null, // set when principal === 'user'
      counter: null, // set when principal === 'counter'
      organization: null,

      login: ({ accessToken, refreshToken, user, counter, organization, principal }) =>
        set({
          token: accessToken,
          accessToken,
          refreshToken,
          principal: principal || (counter ? 'counter' : 'user'),
          user: user || null,
          counter: counter || null,
          organization: organization || null,
        }),

      setTokens: ({ accessToken, refreshToken }) =>
        set({ token: accessToken, accessToken, refreshToken }),

      // Keep the counter's own record fresh (status, departments) after edits.
      setCounter: (counter) => set({ counter }),

      logout: () =>
        set({
          token: null, accessToken: null, refreshToken: null,
          principal: null, user: null, counter: null, organization: null,
        }),
    }),
    { name: 'auth-storage' }
  )
);

/** True when the signed-in principal is an administrator. */
export const useIsAdmin = () => useAuthStore((s) => s.principal === 'user');

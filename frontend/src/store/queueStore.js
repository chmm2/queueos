import { create } from 'zustand';

export const useQueueStore = create((set) => ({
  tokens: [],
  lastCalled: null,

  setTokens: (tokens) => set({ tokens }),
  setLastCalled: (payload) => set({ lastCalled: payload }),
}));

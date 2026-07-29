import { create } from 'zustand';

/**
 * Which branch the console is currently looking at. Admins can switch between
 * all of the org's branches; Operators/Staff are pinned to their own. Config
 * pages (Services, Counters, Analytics) read `branchId` from here so the whole
 * console stays in sync with one branch switcher in the top bar.
 */
export const useBranchStore = create((set) => ({
  branchId: '',
  branches: [],
  setBranches: (branches) => set({ branches }),
  setBranchId: (branchId) => set({ branchId }),
}));

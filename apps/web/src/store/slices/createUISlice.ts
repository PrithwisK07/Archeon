import { StateCreator } from 'zustand';
import { StoreState, UISlice } from '../types';

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const createUISlice: StateCreator<StoreState, [], [], UISlice> = (set, get) => ({
  isExplorerOpen: true,
  isCopilotOpen: false,
  inspectorTarget: null,
  activeRoutineId: null,
  activeTableName: null,
  isApiPlaygroundOpen: false,
  toastMessage: null,

  setIsExplorerOpen: (open) => set({ isExplorerOpen: open }),

  setIsCopilotOpen: (open) =>
    set((state) => ({
      isCopilotOpen: open,
      inspectorTarget: open ? null : state.inspectorTarget,
    })),

  openInspector: (entityName, fieldName) =>
    set({
      inspectorTarget: { entityName, fieldName },
      isCopilotOpen: false,
    }),

  closeInspector: () => set({ inspectorTarget: null }),

  setActiveRoutineId: (id) =>
    set({
      activeRoutineId: id,
      activeTableName: null,
      isApiPlaygroundOpen: false,
    }),

  setActiveTableName: (name) =>
    set({
      activeTableName: name,
      activeRoutineId: null,
      isApiPlaygroundOpen: false,
    }),

  setIsApiPlaygroundOpen: (open) =>
    set({
      isApiPlaygroundOpen: open,
      activeRoutineId: null,
      activeTableName: null,
    }),

  showToast: (msg) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toastMessage: msg });
    toastTimer = setTimeout(() => set({ toastMessage: null }), 3200);
  },
});
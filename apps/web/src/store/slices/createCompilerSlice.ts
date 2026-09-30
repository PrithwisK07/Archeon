import { StateCreator } from 'zustand';
import { ResilientWorkerManager } from '@zero-dollar/compiler/src/index';
import { StoreState, CompilerSlice } from '../types';

const compilerClient = typeof window !== 'undefined' ? new ResilientWorkerManager() : null;

export const createCompilerSlice: StateCreator<StoreState, [], [], CompilerSlice> = (set, get) => ({
  compiledFiles: null,
  isCompiling: false,
  compileError: null,
  exportedRepoUrl: null,
  chatHistory: [],

  setExportedRepoUrl: (url) => set({ exportedRepoUrl: url, isDirty: true, syncStatus: 'syncing' }),

  addChatMessage: (message) =>
    set((state) => ({
      chatHistory: [...state.chatHistory, { ...message, id: crypto.randomUUID() }],
      isDirty: true,
      syncStatus: 'syncing',
    })),

  updateCompiledFile: (path, content) =>
    set((state) => ({
      compiledFiles: state.compiledFiles
        ? { ...state.compiledFiles, [path]: content }
        : { [path]: content },
    })),

  compileArchitecture: async () => {
    if (!compilerClient) return;
    set({ isCompiling: true, compileError: null });
    try {
      const files = await compilerClient.compileWithTimeout(get().present, 8000);
      set({ compiledFiles: files, isCompiling: false, isDirty: false });
    } catch (error: any) {
      set({ compileError: error.message || 'Compilation failed', isCompiling: false });
    }
  },
});
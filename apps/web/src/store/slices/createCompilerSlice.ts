import { StateCreator } from 'zustand';
import { ResilientWorkerManager } from '@zero-dollar/compiler/src/index';
import { StoreState, CompilerSlice } from '../types';
import { db } from '../../lib/db';

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

  updateCompiledFile: (path, content) => {
    const { compiledFiles, projectId } = get();
    const nextFiles = compiledFiles
      ? { ...compiledFiles, [path]: content }
      : { [path]: content };

    set({
      compiledFiles: nextFiles,
      isDirty: true,
      syncStatus: 'syncing',
    });

    // CRITICAL FIX: Persist handwritten code changes to IndexedDB
    if (projectId) {
      db.projects.update(projectId, { compiled_files: nextFiles });
    }
  },

  compileArchitecture: async () => {
    if (!compilerClient) return;
    set({ isCompiling: true, compileError: null });
    
    try {
      const { projectId, compiledFiles } = get();
      
      // Pass existing handwritten files to the worker to preserve the Generation Gap
      const files = await compilerClient.compileWithTimeout(
        get().present, 
        compiledFiles || {}, 
        8000
      );
      
      set({ compiledFiles: files, isCompiling: false, isDirty: false });
      
      // Persist the newly compiled codebase to IndexedDB
      if (projectId) {
        db.projects.update(projectId, { compiled_files: files });
      }
    } catch (error: any) {
      set({ compileError: error.message || 'Compilation failed', isCompiling: false });
    }
  },
});
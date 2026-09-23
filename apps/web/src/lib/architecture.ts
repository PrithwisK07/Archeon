import { create } from 'zustand';
import { db } from '../lib/db';
import type { CanonicalIR } from '@zero-dollar/ir-core';

// The default empty skeleton for a new project
const DEFAULT_IR: CanonicalIR = {
  config: { framework: 'nestjs', database: 'postgresql', authProviders: [] },
  entities: [],
  relations: [],
  enums: [],
  endpoints: []
};

/**
 * cyrb53 (c) 2018 bryc (github.com/bryc). 
 * A fast, collision-resistant 53-bit synchronous string hash.
 */
const generateHash = (str: string | any): string => {
  const jsonStr = typeof str === 'string' ? str : JSON.stringify(str);
  let h1 = 0xdeadbeef ^ jsonStr.length, h2 = 0x41c6ce57 ^ jsonStr.length;
  for(let i = 0, ch; i < jsonStr.length; i++) {
      ch = jsonStr.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
};

interface ArchitectureState {
  projectId: string | null;
  
  // The Time Machine (History Stack)
  past: CanonicalIR[];
  present: CanonicalIR;
  future: CanonicalIR[];

  // Actions
  initializeProject: (projectId: string) => Promise<void>;
  applyAIPatch: (newIR: CanonicalIR) => void;
  undo: () => void;
  redo: () => void;
}

export const useArchitectureStore = create<ArchitectureState>((set, get) => ({
  projectId: null,
  past: [],
  present: DEFAULT_IR,
  future: [],

  // 1. Load project from IndexedDB (or initialize empty)
  initializeProject: async (projectId: string) => {
    try {
      const localData = await db.projects.get(projectId);
      if (localData) {
        set({ projectId, present: localData.canonical_ir, past: [], future: [] });
      } else {
        set({ projectId, present: DEFAULT_IR, past: [], future: [] });
      }
    } catch (error) {
      console.error("Failed to load local project DB:", error);
    }
  },

  // 2. Apply AI Patches and push to History Stack
  applyAIPatch: (newIR: CanonicalIR) => {
    const { present, projectId, past } = get();
    
    // Prevent state bloat: Cap history at 50 steps
    const newPast = [...past, present].slice(-50);

    set({
      past: newPast,
      present: newIR,
      future: [] // Applying a new action invalidates the future redo stack
    });

    // Fire-and-forget sync to IndexedDB
    if (projectId) {
      db.projects.put({
        id: projectId,
        canonical_ir: newIR,
        version_hash: generateHash(newIR),
        updated_at: Date.now()
      });
    }
  },

  // 3. Intent Protection: Ctrl+Z
  undo: () => {
    const { past, present, future, projectId } = get();
    if (past.length === 0) return;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    set({
      past: newPast,
      present: previous,
      future: [present, ...future]
    });

    // Sync reverted state to IndexedDB
    if (projectId) {
      db.projects.put({
        id: projectId,
        canonical_ir: previous,
        version_hash: generateHash(previous),
        updated_at: Date.now()
      });
    }
  },

  // 4. Intent Protection: Ctrl+Y
  redo: () => {
    const { past, present, future, projectId } = get();
    if (future.length === 0) return;

    const next = future[0];
    const newFuture = future.slice(1);

    set({
      past: [...past, present],
      present: next,
      future: newFuture
    });

    if (projectId) {
      db.projects.put({
        id: projectId,
        canonical_ir: next,
        version_hash: generateHash(next),
        updated_at: Date.now()
      });
    }
  }
}));
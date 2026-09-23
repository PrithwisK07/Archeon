import { create } from 'zustand';
import { db } from '../lib/db';
import type { CanonicalIR, MasterAction, CustomSqlSnippet } from '@zero-dollar/ir-core';
import { ResilientWorkerManager } from '@zero-dollar/compiler/src/index';
import { applyNodeChanges, NodeChange, Node } from 'reactflow';
import { ReactFlowAdapter, UINodeData } from '../lib/reactFlowAdapter';
import { ShadowGraph } from '@zero-dollar/compiler/src/shadowGraph';

const compilerClient = typeof window !== 'undefined' ? new ResilientWorkerManager() : null;

// The default empty skeleton for a new project
const DEFAULT_IR: CanonicalIR = {
  config: { framework: 'nestjs', database: 'postgresql', authProviders: [] },
  entities: [],
  relations: [],
  enums: [],
  endpoints: [],
  customSql: [] // Initialize the empty bucket for custom SQL behavior
};

const generateHash = (data: any): string => {
  const str = JSON.stringify(data);
  let h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
  for(let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
};

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

// Extend MasterAction locally to allow manual UI dispatches of Custom SQL
export type IDECommand = MasterAction | { action: 'ADD_CUSTOM_SQL'; payload: CustomSqlSnippet };

interface ArchitectureState {
  projectId: string | null;
  projectName: string;
  
  // The Time Machine (History Stack)
  past: CanonicalIR[];
  present: CanonicalIR;
  future: CanonicalIR[];
  nodes: Node<UINodeData>[];

  compiledFiles: Record<string, string> | null;
  isCompiling: boolean;
  compileError: string | null;
  isDirty: boolean;
  
  // GITHUB EXPORT STATE
  exportedRepoUrl: string | null;
  setExportedRepoUrl: (url: string | null) => void;

  // CHAT HISTORY
  chatHistory: ChatMessage[];
  addChatMessage: (message: Omit<ChatMessage, 'id'>) => void;

  // CLOUD SYNC
  syncStatus: 'synced' | 'syncing' | 'error' | 'offline';
  setSyncStatus: (status: 'synced' | 'syncing' | 'error' | 'offline') => void;
  loadProjectState: (ir: CanonicalIR, chatHistory: ChatMessage[], repoUrl: string | null, name: string) => void;
  markClean: () => void;
  
  // ACTIONS
  compileArchitecture: () => Promise<void>;
  initializeProject: (projectId: string) => Promise<void>;
  applyAIPatch: (newIR: CanonicalIR) => void;
  undo: () => void;
  redo: () => void;
  onNodesChange: (changes: NodeChange[]) => void;
  dispatchManualAction: (action: IDECommand) => void;
}

export const useArchitectureStore = create<ArchitectureState>((set, get) => {

  // Internal helper to safely merge Domain IR updates with UI positions
  const syncUINodes = (newIR: CanonicalIR, currentNodes: Node<UINodeData>[]) => {
    const nodeMap = new Map(currentNodes.map(n => [n.id, n]));
    const generatedNodes = ReactFlowAdapter.generateNodes(newIR);
    
    return generatedNodes.map(newNode => {
      const existingNode = nodeMap.get(newNode.id);
      return existingNode 
        ? { ...newNode, position: existingNode.position } // Preserve user drag
        : newNode; // Use adapter spawn position
    });
  };

  const persistToDB = (id: string, ir: CanonicalIR) => {
    db.projects.put({
      id,
      canonical_ir: ir,
      version_hash: generateHash(ir),
      updated_at: Date.now()
    });
  };

  return {
    projectId: null,
    projectName: 'Untitled Architecture',
    past: [],
    present: DEFAULT_IR,
    future: [],
    nodes: [],
    compiledFiles: null,
    isCompiling: false,
    compileError: null,
    isDirty: false,
    chatHistory: [],
    syncStatus: 'synced',
    exportedRepoUrl: null,

    // Modifying repo URL makes the project dirty (needs sync)
    setExportedRepoUrl: (url) => set({ 
      exportedRepoUrl: url, 
      isDirty: true,
      syncStatus: 'syncing'
    }),

    // Adding chat messages makes the project dirty (needs sync)
    addChatMessage: (message) => {
      set((state) => ({
        chatHistory: [...state.chatHistory, { ...message, id: crypto.randomUUID() }],
        isDirty: true,
        syncStatus: 'syncing'
      }));
    },

    setSyncStatus: (status) => set({ syncStatus: status }),

    // Full state hydration from Supabase
    loadProjectState: (ir, chatHistory, repoUrl, name) => {
      // Ensure legacy saved IRs get the customSql array initialized
      const safeIR = { ...ir, customSql: ir.customSql || [] };
      set({ 
        present: safeIR, 
        nodes: ReactFlowAdapter.generateNodes(safeIR), 
        past: [], 
        future: [], 
        isDirty: false,
        syncStatus: 'synced',
        chatHistory: chatHistory || [],
        exportedRepoUrl: repoUrl || null,
        projectName: name || 'Untitled Architecture'
      });
    },
    
    markClean: () => set({ isDirty: false, syncStatus: 'synced' }),

    dispatchManualAction: (command: IDECommand) => {
      const { present, applyAIPatch } = get();
      try {
        // Intercept Custom SQL generation. It is behavior, not topology, 
        // so it bypasses the strict ShadowGraph semantic validation.
        if (command.action === 'ADD_CUSTOM_SQL') {
          const newIR = { ...present };
          if (!newIR.customSql) newIR.customSql = [];
          
          newIR.customSql = [...newIR.customSql, command.payload];
          applyAIPatch(newIR);
          return;
        }

        // Structural manual actions pass through the exact same semantic validation as AI actions
        const newIR = ShadowGraph.simulateAndValidate(present, [command]);
        applyAIPatch(newIR);
      } catch (error: any) {
        console.error("Manual action rejected:", error.message);
        alert(error.message); 
      }
    },

    compileArchitecture: async () => {
      if (!compilerClient) return;
      
      set({ isCompiling: true, compileError: null });
      try {
        const currentIR = get().present;
        // Triggers the Web Worker Sandbox (8s timeout, OOM protected)
        const files = await compilerClient.compileWithTimeout(currentIR, 8000);
        set({ compiledFiles: files, isCompiling: false, isDirty: false });
      } catch (error: any) {
        console.error("Compilation failed:", error);
        set({ compileError: error.message || "Compilation failed", isCompiling: false });
      }
    },

    initializeProject: async (projectId: string) => {
      try {
        const localData = await db.projects.get(projectId);
        let ir = localData ? localData.canonical_ir : DEFAULT_IR;
        
        // Safety initialization for older projects without customSql
        ir = { ...ir, customSql: ir.customSql || [] };

        set({ 
          projectId, 
          projectName: 'Untitled Architecture',
          present: ir, 
          past: [], 
          future: [],
          nodes: syncUINodes(ir, []),
          chatHistory: [], // Reset chat history on local project load
          isDirty: false,
          syncStatus: 'synced',
          exportedRepoUrl: null // Reset export status on new project load
        });
      } catch (error) {
        console.error("Failed to load local project DB:", error);
      }
    },

    applyAIPatch: (newIR: CanonicalIR) => {
      const { present, projectId, past, nodes } = get();
      const newPast = [...past, present].slice(-50);
      
      // Ensure array exists to prevent downstream crashes
      const safeIR = { ...newIR, customSql: newIR.customSql || [] };

      set({
        past: newPast,
        present: safeIR,
        future: [],
        nodes: syncUINodes(safeIR, nodes),
        isDirty: true,
        syncStatus: 'syncing'
      });

      if (projectId) persistToDB(projectId, safeIR);
    },

    undo: () => {
      const { past, present, future, projectId, nodes } = get();
      if (past.length === 0) return;

      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);

      set({
        past: newPast,
        present: previous,
        future: [present, ...future],
        nodes: syncUINodes(previous, nodes), // Syncs restored/deleted entities to UI
        isDirty: true,
        syncStatus: 'syncing'
      });

      if (projectId) persistToDB(projectId, previous);
    },

    redo: () => {
      const { past, present, future, projectId, nodes } = get();
      if (future.length === 0) return;

      const next = future[0];
      const newFuture = future.slice(1);

      set({
        past: [...past, present],
        present: next,
        future: newFuture,
        nodes: syncUINodes(next, nodes),
        isDirty: true,
        syncStatus: 'syncing'
      });

      if (projectId) persistToDB(projectId, next);
    },

    onNodesChange: (changes: NodeChange[]) => {
      set({
        nodes: applyNodeChanges(changes, get().nodes),
      });
    },
  };
});
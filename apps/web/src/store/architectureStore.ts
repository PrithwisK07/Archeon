import { create } from 'zustand';
import { db } from '../lib/db';
import type { CanonicalIR, MasterAction, CustomSqlSnippet } from '@zero-dollar/ir-core';
import { ResilientWorkerManager } from '@zero-dollar/compiler/src/index';
import { applyNodeChanges, NodeChange, Node } from 'reactflow';
import { ReactFlowAdapter, UINodeData } from '../lib/reactFlowAdapter';
import { ShadowGraph } from '@zero-dollar/compiler/src/shadowGraph';

const compilerClient = typeof window !== 'undefined' ? new ResilientWorkerManager() : null;

const DEFAULT_IR: CanonicalIR = {
  config: { framework: 'nestjs', database: 'postgresql', authProviders: [] },
  entities: [],
  relations: [],
  enums: [],
  endpoints: [],
  customSql: [],
};

const generateHash = (data: any): string => {
  const str = JSON.stringify(data);
  let h1 = 0xdeadbeef ^ str.length,
    h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
};

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai' | 'warn';
  content: string;
}

export interface StickyNote {
  id: string;
  x: number;
  y: number;
  text: string;
}

export interface InspectorTarget {
  entityName: string;
  fieldName: string;
}

export type IDECommand =
  | MasterAction
  | { action: 'ADD_CUSTOM_SQL'; payload: CustomSqlSnippet }
  | { action: 'REMOVE_CUSTOM_SQL'; id: string };

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
  loadProjectState: (
    ir: CanonicalIR,
    chatHistory: ChatMessage[],
    repoUrl: string | null,
    name: string
  ) => void;
  markClean: () => void;

  // NEXUS STUDIO UI STATE
  isExplorerOpen: boolean;
  setIsExplorerOpen: (open: boolean) => void;
  isCopilotOpen: boolean;
  setIsCopilotOpen: (open: boolean) => void;
  inspectorTarget: InspectorTarget | null;
  openInspector: (entityName: string, fieldName: string) => void;
  closeInspector: () => void;
  activeRoutineId: string | null;
  setActiveRoutineId: (id: string | null) => void;
  canvasMode: 'select' | 'pan';
  setCanvasMode: (mode: 'select' | 'pan') => void;
  notes: StickyNote[];
  addNote: () => void;
  updateNote: (id: string, patch: Partial<StickyNote>) => void;
  deleteNote: (id: string) => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  autoArrangeNodes: () => void;
  updateCompiledFile: (path: string, content: string) => void;

  // ACTIONS
  compileArchitecture: () => Promise<void>;
  initializeProject: (projectId: string) => Promise<void>;
  applyAIPatch: (newIR: CanonicalIR) => void;
  undo: () => void;
  redo: () => void;
  onNodesChange: (changes: NodeChange[]) => void;
  dispatchManualAction: (action: IDECommand) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useArchitectureStore = create<ArchitectureState>((set, get) => {
  const syncUINodes = (newIR: CanonicalIR, currentNodes: Node<UINodeData>[]) => {
    const nodeMap = new Map(currentNodes.map((n) => [n.id, n]));
    const generatedNodes = ReactFlowAdapter.generateNodes(newIR);

    return generatedNodes.map((newNode, idx) => {
      const existingNode = nodeMap.get(newNode.id) || currentNodes[idx];
      return existingNode
        ? { ...newNode, position: existingNode.position, selected: existingNode.selected }
        : newNode;
    });
  };

  const persistToDB = (id: string, ir: CanonicalIR) => {
    db.projects.put({
      id,
      canonical_ir: ir,
      version_hash: generateHash(ir),
      updated_at: Date.now(),
    });
  };

  return {
    projectId: null,
    projectName: 'untitled-workspace',
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

    // Nexus UI defaults
    isExplorerOpen: true,
    isCopilotOpen: false,
    inspectorTarget: null,
    activeRoutineId: null,
    canvasMode: 'select',
    notes: [],
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

    setActiveRoutineId: (id) => set({ activeRoutineId: id }),

    setCanvasMode: (mode) => set({ canvasMode: mode }),

    addNote: () => {
      const newNote: StickyNote = {
        id: `note_${Date.now()}`,
        x: 220 + Math.round(Math.random() * 80),
        y: 160 + Math.round(Math.random() * 80),
        text: 'New note — click to edit',
      };
      set((state) => ({ notes: [...state.notes, newNote] }));
      get().showToast('Note added to canvas');
    },

    updateNote: (id, patch) =>
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      })),

    deleteNote: (id) => {
      set((state) => ({ notes: state.notes.filter((n) => n.id !== id) }));
      get().showToast('Note deleted');
    },

    showToast: (msg) => {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toastMessage: msg });
      toastTimer = setTimeout(() => {
        set({ toastMessage: null });
      }, 3200);
    },

    autoArrangeNodes: () => {
      const cols = 3;
      const gapX = 290;
      const gapY = 260;
      set((state) => ({
        nodes: state.nodes.map((node, i) => ({
          ...node,
          position: {
            x: 60 + (i % cols) * gapX,
            y: 60 + Math.floor(i / cols) * gapY,
          },
        })),
      }));
      get().showToast('Tables auto-arranged');
    },

    updateCompiledFile: (path, content) =>
      set((state) => ({
        compiledFiles: state.compiledFiles
          ? { ...state.compiledFiles, [path]: content }
          : { [path]: content },
      })),

    setExportedRepoUrl: (url) =>
      set({
        exportedRepoUrl: url,
        isDirty: true,
        syncStatus: 'syncing',
      }),

    addChatMessage: (message) => {
      set((state) => ({
        chatHistory: [...state.chatHistory, { ...message, id: crypto.randomUUID() }],
        isDirty: true,
        syncStatus: 'syncing',
      }));
    },

    setSyncStatus: (status) => set({ syncStatus: status }),

    loadProjectState: (ir, chatHistory, repoUrl, name) => {
      const safeIR = {
        ...DEFAULT_IR,
        ...(ir || {}),
        customSql: ir?.customSql || [],
      };
      set({
        present: safeIR,
        nodes: ReactFlowAdapter.generateNodes(safeIR),
        past: [],
        future: [],
        isDirty: false,
        syncStatus: 'synced',
        chatHistory: chatHistory || [],
        exportedRepoUrl: repoUrl || null,
        projectName: name || 'untitled-workspace',
        inspectorTarget: null,
        activeRoutineId: null,
      });
    },

    markClean: () => set({ isDirty: false, syncStatus: 'synced' }),

    dispatchManualAction: (command: IDECommand) => {
      const { present, applyAIPatch, inspectorTarget } = get();
      try {
        if (command.action === 'ADD_CUSTOM_SQL') {
          const newIR: CanonicalIR = {
            ...present,
            customSql: [...(present.customSql || []), command.payload],
          };
          applyAIPatch(newIR);
          return;
        }

        if (command.action === 'REMOVE_CUSTOM_SQL') {
          const newIR: CanonicalIR = {
            ...present,
            customSql: (present.customSql || []).filter((s) => s.id !== command.id),
          };
          applyAIPatch(newIR);
          return;
        }

        const newIR = ShadowGraph.simulateAndValidate(present, [command]);
        applyAIPatch(newIR);

        // Keep Inspector target synchronized if a field or entity was renamed
        if (
          command.action === 'UPDATE_FIELD' &&
          inspectorTarget &&
          inspectorTarget.entityName === command.targetEntity &&
          inspectorTarget.fieldName === command.targetField &&
          command.payload.name
        ) {
          set({
            inspectorTarget: {
              entityName: command.targetEntity,
              fieldName: command.payload.name,
            },
          });
        }
      } catch (error: any) {
        console.error('Manual action rejected:', error.message);
        get().showToast(error.message);
      }
    },

    compileArchitecture: async () => {
      if (!compilerClient) return;

      set({ isCompiling: true, compileError: null });
      try {
        const currentIR = get().present;
        const files = await compilerClient.compileWithTimeout(currentIR, 8000);
        set({ compiledFiles: files, isCompiling: false, isDirty: false });
      } catch (error: any) {
        console.error('Compilation failed:', error);
        set({
          compileError: error.message || 'Compilation failed',
          isCompiling: false,
        });
      }
    },

    initializeProject: async (projectId: string) => {
      try {
        const localData = await db.projects.get(projectId);
        let ir = localData ? localData.canonical_ir : DEFAULT_IR;
        ir = { ...ir, customSql: ir.customSql || [] };

        set({
          projectId,
          projectName: 'untitled-workspace',
          present: ir,
          past: [],
          future: [],
          nodes: syncUINodes(ir, []),
          chatHistory: [],
          isDirty: false,
          syncStatus: 'synced',
          exportedRepoUrl: null,
        });
      } catch (error) {
        console.error('Failed to load local project DB:', error);
      }
    },

    applyAIPatch: (newIR: CanonicalIR) => {
      const { present, projectId, past, nodes } = get();
      const newPast = [...past, present].slice(-50);
      const safeIR = { ...newIR, customSql: newIR.customSql || [] };

      set({
        past: newPast,
        present: safeIR,
        future: [],
        nodes: syncUINodes(safeIR, nodes),
        isDirty: true,
        syncStatus: 'syncing',
      });

      if (projectId) persistToDB(projectId, safeIR);
    },

    undo: () => {
      const { past, present, future, projectId, nodes, showToast } = get();
      if (past.length === 0) {
        showToast('Nothing to undo');
        return;
      }

      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);

      set({
        past: newPast,
        present: previous,
        future: [present, ...future],
        nodes: syncUINodes(previous, nodes),
        isDirty: true,
        syncStatus: 'syncing',
      });

      if (projectId) persistToDB(projectId, previous);
    },

    redo: () => {
      const { past, present, future, projectId, nodes, showToast } = get();
      if (future.length === 0) {
        showToast('Nothing to redo');
        return;
      }

      const next = future[0];
      const newFuture = future.slice(1);

      set({
        past: [...past, present],
        present: next,
        future: newFuture,
        nodes: syncUINodes(next, nodes),
        isDirty: true,
        syncStatus: 'syncing',
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
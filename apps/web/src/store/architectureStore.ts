import { create } from 'zustand';
import { db } from '../lib/db';
import type { CanonicalIR, MasterAction, CustomSqlSnippet } from '@zero-dollar/ir-core';
import { ResilientWorkerManager } from '@zero-dollar/compiler/src/index';
import { applyNodeChanges, NodeChange, Node } from 'reactflow';
import { ReactFlowAdapter, UINodeData } from '../lib/reactFlowAdapter';
import { ShadowGraph } from '@zero-dollar/compiler/src/shadowGraph';
import { SeedEngine } from '../lib/seedEngine';

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

export type StickyNoteColor = 'yellow' | 'amber' | 'rose' | 'violet' | 'cyan' | 'lime';

export interface StickyNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color?: StickyNoteColor;
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

  // History Stack
  past: CanonicalIR[];
  present: CanonicalIR;
  future: CanonicalIR[];
  nodes: Node<UINodeData>[];

  compiledFiles: Record<string, string> | null;
  isCompiling: boolean;
  compileError: string | null;
  isDirty: boolean;

  // GitHub & Chat
  exportedRepoUrl: string | null;
  setExportedRepoUrl: (url: string | null) => void;
  chatHistory: ChatMessage[];
  addChatMessage: (message: Omit<ChatMessage, 'id'>) => void;

  // Cloud Sync
  syncStatus: 'synced' | 'syncing' | 'error' | 'offline';
  setSyncStatus: (status: 'synced' | 'syncing' | 'error' | 'offline') => void;
  loadProjectState: (
    ir: CanonicalIR,
    chatHistory: ChatMessage[],
    repoUrl: string | null,
    name: string
  ) => void;
  markClean: () => void;

  // Studio UI State
  isExplorerOpen: boolean;
  setIsExplorerOpen: (open: boolean) => void;
  isCopilotOpen: boolean;
  setIsCopilotOpen: (open: boolean) => void;
  inspectorTarget: InspectorTarget | null;
  openInspector: (entityName: string, fieldName: string) => void;
  closeInspector: () => void;

  // Active Center Workspace Mode
  activeRoutineId: string | null;
  setActiveRoutineId: (id: string | null) => void;
  activeTableName: string | null;
  setActiveTableName: (name: string | null) => void;
  isApiPlaygroundOpen: boolean;
  setIsApiPlaygroundOpen: (open: boolean) => void;

  // Table Seeding & Row Operations (Delegated to SeedEngine)
  seedTableData: (entityName: string, count?: number) => void;
  addTableRow: (entityName: string, initialData?: Record<string, any>) => Record<string, any> | null;
  updateTableRow: (entityName: string, rowIndex: number, fieldName: string, value: any) => void;
  deleteTableRow: (entityName: string, rowIndex: number) => void;
  clearTableData: (entityName: string) => void;
  setEntitySeedData: (entityName: string, rows: Record<string, any>[]) => void;

  // Canvas & Notes
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

  // Core Graph & Compiler Actions
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

    isExplorerOpen: true,
    isCopilotOpen: false,
    inspectorTarget: null,
    activeRoutineId: null,
    activeTableName: null,
    isApiPlaygroundOpen: false,
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

    setEntitySeedData: (entityName, rows) => {
      const { present, applyAIPatch } = get();
      const newEntities = present.entities.map((ent) =>
        ent.name === entityName ? { ...ent, seedData: rows } : ent
      );
      applyAIPatch({ ...present, entities: newEntities });
    },

    seedTableData: (entityName, count = 5) => {
      const { present, applyAIPatch, showToast } = get();
      const result = SeedEngine.seedEntityWithDependencies(present, entityName, count);
      applyAIPatch(result.ir);
      showToast(result.message);
    },

    addTableRow: (entityName, initialData) => {
      const { present, setEntitySeedData } = get();
      const entity = present.entities.find((e) => e.name === entityName);
      if (!entity) return null;

      const newRow = SeedEngine.createBlankRow(entity, initialData, present);
      setEntitySeedData(entityName, [...(entity.seedData || []), newRow]);
      return newRow;
    },

    updateTableRow: (entityName, rowIndex, fieldName, value) => {
      const { present, projectId } = get();
      const entity = present.entities.find((e) => e.name === entityName);
      if (!entity || !entity.seedData) return;

      const fieldDef = entity.fields.find((f) => f.name === fieldName);
      const coercedValue = SeedEngine.coerceCellValue(fieldDef, value);

      const nextRows = entity.seedData.map((row, idx) =>
        idx === rowIndex ? { ...row, [fieldName]: coercedValue } : row
      );

      const newIR: CanonicalIR = {
        ...present,
        entities: present.entities.map((ent) =>
          ent.name === entityName ? { ...ent, seedData: nextRows } : ent
        ),
      };

      set({ present: newIR, isDirty: true, syncStatus: 'syncing' });
      if (projectId) persistToDB(projectId, newIR);
    },

    deleteTableRow: (entityName, rowIndex) => {
      const { present, applyAIPatch, showToast } = get();
      try {
        const result = SeedEngine.deleteRowWithIntegrity(present, entityName, rowIndex);
        applyAIPatch(result.ir);
        showToast(result.message);
      } catch (err: any) {
        showToast(err.message);
      }
    },

    clearTableData: (entityName) => {
      const { present, applyAIPatch, showToast } = get();
      try {
        const result = SeedEngine.clearTableWithIntegrity(present, entityName);
        applyAIPatch(result.ir);
        showToast(result.message);
      } catch (err: any) {
        showToast(err.message);
      }
    },

    setCanvasMode: (mode) => set({ canvasMode: mode }),

    addNote: () => {
      const palette: StickyNoteColor[] = ['yellow', 'amber', 'rose', 'violet', 'cyan', 'lime'];
      const currentNotes = get().notes;
      const nextColor = palette[currentNotes.length % palette.length];

      const newNote: StickyNote = {
        id: `note_${Date.now()}`,
        x: 220 + Math.round(Math.random() * 80),
        y: 160 + Math.round(Math.random() * 80),
        text: 'New note — click to edit',
        color: nextColor,
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
      toastTimer = setTimeout(() => set({ toastMessage: null }), 3200);
    },

    autoArrangeNodes: () => {
      const cols = 3,
        gapX = 290,
        gapY = 260;
      set((state) => ({
        nodes: state.nodes.map((node, i) => ({
          ...node,
          position: { x: 60 + (i % cols) * gapX, y: 60 + Math.floor(i / cols) * gapY },
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
      set({ exportedRepoUrl: url, isDirty: true, syncStatus: 'syncing' }),

    addChatMessage: (message) =>
      set((state) => ({
        chatHistory: [...state.chatHistory, { ...message, id: crypto.randomUUID() }],
        isDirty: true,
        syncStatus: 'syncing',
      })),

    setSyncStatus: (status) => set({ syncStatus: status }),

    loadProjectState: (ir, chatHistory, repoUrl, name) => {
      const safeIR: CanonicalIR = JSON.parse(
        JSON.stringify({ ...DEFAULT_IR, ...(ir || {}), customSql: ir?.customSql || [] })
      );

      // Clean up any dangling relations pointing to deleted fields & demote PK->PK targets once on load
      safeIR.relations = safeIR.relations.filter((rel) => {
        const sEnt = safeIR.entities.find((e) => e.name === rel.sourceEntity);
        const tEnt = safeIR.entities.find((e) => e.name === rel.targetEntity);
        if (!sEnt || !tEnt) return false;
        if (rel.sourceField && !sEnt.fields.some((f) => f.name === rel.sourceField)) return false;
        if (rel.targetField && !tEnt.fields.some((f) => f.name === rel.targetField)) return false;

        const sField = sEnt.fields.find((f) => f.name === rel.sourceField);
        const tField = tEnt.fields.find((f) => f.name === rel.targetField);
        if (
          sField &&
          tField &&
          (sField.isPrimaryKey ?? sField.name === 'id') &&
          (tField.isPrimaryKey ?? tField.name === 'id')
        ) {
          tField.isPrimaryKey = false;
          tField.unique = false;
        }
        return true;
      });

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
        activeTableName: null,
        isApiPlaygroundOpen: false,
      });
    },

    markClean: () => set({ isDirty: false, syncStatus: 'synced' }),

    dispatchManualAction: (command: IDECommand) => {
      const { present, applyAIPatch, inspectorTarget, activeTableName, showToast } = get();
      try {
        if (command.action === 'ADD_CUSTOM_SQL') {
          applyAIPatch({
            ...present,
            customSql: [...(present.customSql || []), command.payload],
          });
          return;
        }

        if (command.action === 'REMOVE_CUSTOM_SQL') {
          applyAIPatch({
            ...present,
            customSql: (present.customSql || []).filter((s) => s.id !== command.id),
          });
          return;
        }

        let simulatedIR = ShadowGraph.simulateAndValidate(present, [command]);

        // 1. If a field was deleted, remove any relations plugged into that field so no ghost wires remain
        if (command.action === 'REMOVE_FIELD') {
          simulatedIR = {
            ...simulatedIR,
            relations: simulatedIR.relations.filter(
              (rel) =>
                !(
                  rel.sourceEntity === command.targetEntity &&
                  rel.sourceField === command.targetField
                ) &&
                !(
                  rel.targetEntity === command.targetEntity &&
                  rel.targetField === command.targetField
                )
            ),
          };
        }

        // 2. If a relation was connected PK -> PK, demote the target field in the store immediately
        if (command.action === 'ADD_RELATION') {
          const { sourceEntity, targetEntity, sourceField, targetField } = command.payload;
          const sEnt = simulatedIR.entities.find((e) => e.name === sourceEntity);
          const tEnt = simulatedIR.entities.find((e) => e.name === targetEntity);
          const sField = sEnt?.fields.find((f) => f.name === sourceField);
          const tField = tEnt?.fields.find((f) => f.name === targetField);

          if (
            sField &&
            tField &&
            (sField.isPrimaryKey ?? sField.name === 'id') &&
            (tField.isPrimaryKey ?? tField.name === 'id')
          ) {
            tField.isPrimaryKey = false;
            tField.unique = false;
          }
        }

        // 3. If user explicitly toggles Primary Key ON in the Inspector, remove any incoming FK wire on that field
        if (command.action === 'UPDATE_FIELD' && command.payload.isPrimaryKey === true) {
          const fieldName = command.payload.name || command.targetField;
          const beforeCount = simulatedIR.relations.length;
          simulatedIR = {
            ...simulatedIR,
            relations: simulatedIR.relations.filter(
              (rel) =>
                !(rel.targetEntity === command.targetEntity && rel.targetField === fieldName)
            ),
          };
          if (simulatedIR.relations.length < beforeCount) {
            showToast('Promoted to Primary Key (removed incoming FK relation)');
          }
        }

        // 4. If a field was renamed, keep relation handles pointing to the new field name
        if (
          command.action === 'UPDATE_FIELD' &&
          command.payload.name &&
          command.payload.name !== command.targetField
        ) {
          const newFieldName = command.payload.name;
          simulatedIR = {
            ...simulatedIR,
            relations: simulatedIR.relations.map((rel) => ({
              ...rel,
              sourceField:
                rel.sourceEntity === command.targetEntity &&
                rel.sourceField === command.targetField
                  ? newFieldName
                  : rel.sourceField,
              targetField:
                rel.targetEntity === command.targetEntity &&
                rel.targetField === command.targetField
                  ? newFieldName
                  : rel.targetField,
            })),
          };
        }

        const syncedIR = SeedEngine.synchronizeSchemaAndData(present, simulatedIR);
        applyAIPatch(syncedIR);

        if (command.action === 'UPDATE_ENTITY' && command.payload.name) {
          if (activeTableName === command.targetEntity) {
            set({ activeTableName: command.payload.name });
          }
          if (inspectorTarget?.entityName === command.targetEntity) {
            set({ inspectorTarget: { ...inspectorTarget, entityName: command.payload.name } });
          }
        }

        if (command.action === 'REMOVE_ENTITY') {
          if (activeTableName === command.targetEntity) set({ activeTableName: null });
          if (inspectorTarget?.entityName === command.targetEntity) set({ inspectorTarget: null });
        }

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
        const files = await compilerClient.compileWithTimeout(get().present, 8000);
        set({ compiledFiles: files, isCompiling: false, isDirty: false });
      } catch (error: any) {
        set({ compileError: error.message || 'Compilation failed', isCompiling: false });
      }
    },

    initializeProject: async (projectId: string) => {
      try {
        const localData = await db.projects.get(projectId);
        const ir = { ...(localData ? localData.canonical_ir : DEFAULT_IR), customSql: localData?.canonical_ir?.customSql || [] };
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
      const safeIR = { ...newIR, customSql: newIR.customSql || [] };
      set({
        past: [...past, present].slice(-50),
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
      if (past.length === 0) return showToast('Nothing to undo');
      const previous = past[past.length - 1];
      set({
        past: past.slice(0, -1),
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
      if (future.length === 0) return showToast('Nothing to redo');
      const next = future[0];
      set({
        past: [...past, present],
        present: next,
        future: future.slice(1),
        nodes: syncUINodes(next, nodes),
        isDirty: true,
        syncStatus: 'syncing',
      });
      if (projectId) persistToDB(projectId, next);
    },

    onNodesChange: (changes: NodeChange[]) => {
      set({ nodes: applyNodeChanges(changes, get().nodes) });
    },
  };
});
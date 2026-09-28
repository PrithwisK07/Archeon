import { create } from 'zustand';
import { db } from '../lib/db';
import type {
  CanonicalIR,
  Entity,
  MasterAction,
  CustomSqlSnippet,
} from '@zero-dollar/ir-core';
import { ResilientWorkerManager } from '@zero-dollar/compiler/src/index';
import { applyNodeChanges, NodeChange, Node } from 'reactflow';
import { ReactFlowAdapter, UINodeData } from '../lib/reactFlowAdapter';
import { ShadowGraph } from '@zero-dollar/compiler/src/shadowGraph';
import { SeedEngine } from '../lib/seedEngine';

const compilerClient =
  typeof window !== 'undefined' ? new ResilientWorkerManager() : null;

const DEFAULT_IR: CanonicalIR = {
  config: { framework: 'nestjs', database: 'postgresql', authProviders: [] },
  entities: [],
  relations: [],
  enums: [],
  endpoints: [],
  customSql: [],
  notes: [],
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
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
};

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai' | 'warn';
  content: string;
}

export type StickyNoteColor =
  | 'yellow'
  | 'amber'
  | 'rose'
  | 'violet'
  | 'cyan'
  | 'lime';

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

  // Table Seeding, Indexes & Composite Key Operations
  seedTableData: (entityName: string, count?: number) => void;
  addTableRow: (
    entityName: string,
    initialData?: Record<string, any>
  ) => Record<string, any> | null;
  updateTableRow: (
    entityName: string,
    rowIndex: number,
    fieldName: string,
    value: any
  ) => void;
  deleteTableRow: (entityName: string, rowIndex: number) => void;
  clearTableData: (entityName: string) => void;
  setEntitySeedData: (entityName: string, rows: Record<string, any>[]) => void;
  updateEntityIndexes: (
    entityName: string,
    indexes: NonNullable<Entity['indexes']>
  ) => void;
  autoWireCompositeRelation: (parentEntity: string, childEntity: string) => void;

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

const normalizeNotes = (rawNotes?: any[]): StickyNote[] =>
  (rawNotes || []).map((n, i) => ({
    id: String(n?.id || `note_${Date.now()}_${i}`),
    x: typeof n?.x === 'number' ? n.x : 220,
    y: typeof n?.y === 'number' ? n.y : 160,
    text: String(n?.text ?? ''),
    color: (n?.color as StickyNoteColor) || 'yellow',
  }));

export const useArchitectureStore = create<ArchitectureState>((set, get) => {
  const syncUINodes = (newIR: CanonicalIR, currentNodes: Node<UINodeData>[]) => {
    const nodeMap = new Map(currentNodes.map((n) => [n.id, n]));
    const generatedNodes = ReactFlowAdapter.generateNodes(newIR);

    return generatedNodes.map((newNode, idx) => {
      const existingNode = nodeMap.get(newNode.id) || currentNodes[idx];
      return existingNode
        ? {
            ...newNode,
            position: existingNode.position,
            selected: existingNode.selected,
          }
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
      const { present, projectId, nodes } = get();
      const newIR: CanonicalIR = {
        ...present,
        entities: present.entities.map((ent) =>
          ent.name === entityName ? { ...ent, seedData: rows } : ent
        ),
      };
      set({
        present: newIR,
        nodes: syncUINodes(newIR, nodes),
        isDirty: true,
        syncStatus: 'syncing',
      });
      if (projectId) persistToDB(projectId, newIR);
    },

    seedTableData: (entityName, count = 5) => {
      const { present, applyAIPatch, showToast } = get();
      const result = SeedEngine.seedEntityWithDependencies(
        present,
        entityName,
        count
      );
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
      const { present, projectId, nodes, showToast } = get();
      try {
        const newIR = SeedEngine.updateCellWithIntegrity(
          present,
          entityName,
          rowIndex,
          fieldName,
          value
        );
        set({
          present: newIR,
          nodes: syncUINodes(newIR, nodes),
          isDirty: true,
          syncStatus: 'syncing',
        });
        if (projectId) persistToDB(projectId, newIR);
      } catch (err: any) {
        showToast(err.message);
      }
    },

    deleteTableRow: (entityName, rowIndex) => {
      const { present, applyAIPatch, showToast } = get();
      try {
        const result = SeedEngine.deleteRowWithIntegrity(
          present,
          entityName,
          rowIndex
        );
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

    updateEntityIndexes: (entityName, indexes) => {
      const { present, applyAIPatch, showToast } = get();
      const newIR: CanonicalIR = {
        ...present,
        entities: present.entities.map((ent) =>
          ent.name === entityName ? { ...ent, indexes } : ent
        ),
      };
      const syncedIR = SeedEngine.synchronizeSchemaAndData(present, newIR);
      applyAIPatch(syncedIR);
      showToast(`Updated indexes on ${entityName}`);
    },

    autoWireCompositeRelation: (parentEntityName, childEntityName) => {
      const { present, applyAIPatch, showToast } = get();
      const workingIR: CanonicalIR = JSON.parse(JSON.stringify(present));

      const parentEnt = workingIR.entities.find(
        (e) => e.name === parentEntityName
      );
      const childEnt = workingIR.entities.find((e) => e.name === childEntityName);
      if (!parentEnt || !childEnt) return;

      const incompleteGroups = SeedEngine.getIncompleteCompositeRelations(
        workingIR
      ).filter(
        (g) =>
          g.parentEntity === parentEntityName && g.childEntity === childEntityName
      );
      if (incompleteGroups.length === 0) return;

      const group = incompleteGroups[0];
      const prefix = parentEntityName.toLowerCase().replace(/s$/, '');

      for (const missingPk of group.missingParentPkFields) {
        const parentField = parentEnt.fields.find((f) => f.name === missingPk);
        if (!parentField) continue;

        // Find or create matching FK column on childEnt
        let targetFkField = childEnt.fields.find(
          (f) =>
            f.name === missingPk ||
            f.name === `${prefix}_${missingPk}`
        );

        if (!targetFkField) {
          const newFieldName =
            missingPk === 'id' ? `${prefix}_id` : missingPk;
          targetFkField = {
            name: newFieldName,
            type: parentField.type,
            isPrimaryKey: false,
            nullable: false,
            unique: false,
          };
          childEnt.fields.push(targetFkField);
        }

        workingIR.relations.push({
          sourceEntity: parentEntityName,
          targetEntity: childEntityName,
          sourceField: missingPk,
          targetField: targetFkField.name,
          type: group.type,
          onDelete: group.onDelete,
        });
      }

      const syncedIR = SeedEngine.synchronizeSchemaAndData(present, workingIR);
      applyAIPatch(syncedIR);
      showToast(
        `Completed composite foreign key from ${parentEntityName} → ${childEntityName}`
      );
    },

    setCanvasMode: (mode) => set({ canvasMode: mode }),

    addNote: () => {
      const { present, projectId, showToast } = get();
      const palette: StickyNoteColor[] = [
        'yellow',
        'amber',
        'rose',
        'violet',
        'cyan',
        'lime',
      ];
      const currentNotes = normalizeNotes(present.notes);
      const nextColor = palette[currentNotes.length % palette.length];

      const newNote: StickyNote = {
        id: `note_${Date.now()}`,
        x: 220 + Math.round(Math.random() * 80),
        y: 160 + Math.round(Math.random() * 80),
        text: 'New note — click to edit',
        color: nextColor,
      };

      const nextNotes: StickyNote[] = [...currentNotes, newNote];
      const newIR: CanonicalIR = {
        ...present,
        notes: nextNotes as any,
      };

      set({
        present: newIR,
        notes: nextNotes,
        isDirty: true,
        syncStatus: 'syncing',
      });
      if (projectId) persistToDB(projectId, newIR);
      showToast('Note added to canvas');
    },

    updateNote: (id: string, patch: Partial<StickyNote>) => {
      const { present, projectId } = get();
      const currentNotes = normalizeNotes(present.notes);
      const nextNotes: StickyNote[] = currentNotes.map((n) =>
        n.id === id ? { ...n, ...patch } : n
      );
      const newIR: CanonicalIR = {
        ...present,
        notes: nextNotes as any,
      };

      set({
        present: newIR,
        notes: nextNotes,
        isDirty: true,
        syncStatus: 'syncing',
      });
      if (projectId) persistToDB(projectId, newIR);
    },

    deleteNote: (id: string) => {
      const { present, projectId, showToast } = get();
      const currentNotes = normalizeNotes(present.notes);
      const nextNotes: StickyNote[] = currentNotes.filter((n) => n.id !== id);
      const newIR: CanonicalIR = {
        ...present,
        notes: nextNotes as any,
      };

      set({
        present: newIR,
        notes: nextNotes,
        isDirty: true,
        syncStatus: 'syncing',
      });
      if (projectId) persistToDB(projectId, newIR);
      showToast('Note deleted');
    },

    showToast: (msg) => {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toastMessage: msg });
      toastTimer = setTimeout(() => set({ toastMessage: null }), 3200);
    },

    autoArrangeNodes: () => {
      const cols = 3,
        gapX = 360,
        gapY = 300;
      set((state) => ({
        nodes: state.nodes.map((node, i) => ({
          ...node,
          position: {
            x: 80 + (i % cols) * gapX,
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
      set({ exportedRepoUrl: url, isDirty: true, syncStatus: 'syncing' }),

    addChatMessage: (message) =>
      set((state) => ({
        chatHistory: [
          ...state.chatHistory,
          { ...message, id: crypto.randomUUID() },
        ],
        isDirty: true,
        syncStatus: 'syncing',
      })),

    setSyncStatus: (status) => set({ syncStatus: status }),

    loadProjectState: (ir, chatHistory, repoUrl, name) => {
      const safeNotes = normalizeNotes(ir?.notes);
      const safeIR: CanonicalIR = JSON.parse(
        JSON.stringify({
          ...DEFAULT_IR,
          ...(ir || {}),
          customSql: ir?.customSql || [],
          notes: safeNotes || [],
        })
      );

      safeIR.relations = safeIR.relations.filter((rel) => {
        const sEnt = safeIR.entities.find((e) => e.name === rel.sourceEntity);
        const tEnt = safeIR.entities.find((e) => e.name === rel.targetEntity);
        if (!sEnt || !tEnt) return false;
        if (rel.sourceField && !sEnt.fields.some((f) => f.name === rel.sourceField))
          return false;
        if (rel.targetField && !tEnt.fields.some((f) => f.name === rel.targetField))
          return false;

        const sField = sEnt.fields.find((f) => f.name === rel.sourceField);
        const tField = tEnt.fields.find((f) => f.name === rel.targetField);
        const targetPkFields = SeedEngine.getEntityPkFields(tEnt);

        if (
          sField &&
          tField &&
          (sField.isPrimaryKey ?? sField.name === 'id') &&
          (tField.isPrimaryKey ?? tField.name === 'id') &&
          targetPkFields.length === 1
        ) {
          tField.isPrimaryKey = false;
          tField.unique = false;
        }
        return true;
      });

      set({
        present: safeIR,
        nodes: ReactFlowAdapter.generateNodes(safeIR),
        notes: safeNotes,
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
      const {
        present,
        applyAIPatch,
        inspectorTarget,
        activeTableName,
      } = get();
      try {
        const cmd = command as any;

        if (cmd.action === 'ADD_CUSTOM_SQL') {
          applyAIPatch({
            ...present,
            customSql: [...(present.customSql || []), cmd.payload],
          });
          return;
        }

        if (cmd.action === 'REMOVE_CUSTOM_SQL') {
          applyAIPatch({
            ...present,
            customSql: (present.customSql || []).filter((s) => s.id !== cmd.id),
          });
          return;
        }

        // Enforce PK => nullable: false before simulation
        const normalizedCommand: MasterAction =
          cmd.action === 'UPDATE_FIELD' && cmd.payload?.isPrimaryKey === true
            ? ({
                ...cmd,
                payload: { ...cmd.payload, nullable: false },
              } as MasterAction)
            : (command as MasterAction);

        const targetEntity: string | undefined = cmd.targetEntity;
        const targetField: string | undefined = cmd.targetField;
        const payload: any = (normalizedCommand as any).payload;

        let simulatedIR = ShadowGraph.simulateAndValidate(present, [
          normalizedCommand,
        ]);

        // 1. REMOVE_FIELD: Clean up relations, entity.primaryKey, and entity.indexes referencing the deleted field
        if (cmd.action === 'REMOVE_FIELD' && targetEntity && targetField) {
          simulatedIR = {
            ...simulatedIR,
            relations: simulatedIR.relations.filter(
              (rel) =>
                !(
                  rel.sourceEntity === targetEntity &&
                  rel.sourceField === targetField
                ) &&
                !(
                  rel.targetEntity === targetEntity &&
                  rel.targetField === targetField
                )
            ),
            entities: simulatedIR.entities.map((ent) => {
              if (ent.name !== targetEntity) return ent;
              const nextPk = ent.primaryKey?.filter((f) => f !== targetField);
              const nextIndexes = (ent.indexes || [])
                .map((idx) => ({
                  ...idx,
                  fields: idx.fields.filter((f) => f !== targetField),
                }))
                .filter((idx) => idx.fields.length > 0);
              return {
                ...ent,
                primaryKey: nextPk && nextPk.length > 1 ? nextPk : undefined,
                indexes: nextIndexes,
              };
            }),
          };
        }

        // 2. ADD_RELATION: Demote target PK -> FK ONLY if target table has a single PK (preserve Composite PK join tables!)
        if (cmd.action === 'ADD_RELATION' && payload) {
          const { sourceEntity, targetEntity: relTargetEnt, sourceField, targetField: relTargetField } =
            payload;
          const sEnt = simulatedIR.entities.find((e) => e.name === sourceEntity);
          const tEnt = simulatedIR.entities.find((e) => e.name === relTargetEnt);
          const sField = sEnt?.fields.find((f) => f.name === sourceField);
          const tField = tEnt?.fields.find((f) => f.name === relTargetField);

          if (sEnt && tEnt && sField && tField) {
            const targetPkFields = SeedEngine.getEntityPkFields(tEnt);
            const sIsPk = sField.isPrimaryKey ?? sField.name === 'id';
            const tIsPk = tField.isPrimaryKey ?? tField.name === 'id';

            if (sIsPk && tIsPk && targetPkFields.length === 1) {
              tField.isPrimaryKey = false;
              tField.unique = false;
            }
          }
        }

        // 3. UPDATE_FIELD: Sync composite entity.primaryKey and handle field renames across relations & indexes
        if (cmd.action === 'UPDATE_FIELD' && targetEntity && targetField) {
          const oldName = targetField;
          const newName: string = payload?.name || oldName;

          simulatedIR = {
            ...simulatedIR,
            entities: simulatedIR.entities.map((ent) => {
              if (ent.name !== targetEntity) return ent;

              const pkFieldNames = ent.fields
                .filter((f) => f.isPrimaryKey ?? f.name === 'id')
                .map((f) => f.name);

              const nextIndexes = (ent.indexes || []).map((idx) => ({
                ...idx,
                fields: idx.fields.map((f) => (f === oldName ? newName : f)),
              }));

              return {
                ...ent,
                primaryKey: pkFieldNames.length > 1 ? pkFieldNames : undefined,
                indexes: nextIndexes,
              };
            }),
          };

          if (newName !== oldName) {
            simulatedIR = {
              ...simulatedIR,
              relations: simulatedIR.relations.map((rel) => ({
                ...rel,
                sourceField:
                  rel.sourceEntity === targetEntity &&
                  rel.sourceField === oldName
                    ? newName
                    : rel.sourceField,
                targetField:
                  rel.targetEntity === targetEntity &&
                  rel.targetField === oldName
                    ? newName
                    : rel.targetField,
              })),
            };
          }
        }

        const syncedIR = SeedEngine.synchronizeSchemaAndData(present, simulatedIR);
        applyAIPatch(syncedIR);

        if (cmd.action === 'UPDATE_ENTITY' && payload?.name && targetEntity) {
          if (activeTableName === targetEntity) {
            set({ activeTableName: payload.name });
          }
          if (inspectorTarget?.entityName === targetEntity) {
            set({
              inspectorTarget: {
                ...inspectorTarget,
                entityName: payload.name,
              },
            });
          }
        }

        if (cmd.action === 'REMOVE_ENTITY' && targetEntity) {
          if (activeTableName === targetEntity)
            set({ activeTableName: null });
          if (inspectorTarget?.entityName === targetEntity)
            set({ inspectorTarget: null });
        }

        if (
          cmd.action === 'UPDATE_FIELD' &&
          inspectorTarget &&
          inspectorTarget.entityName === targetEntity &&
          inspectorTarget.fieldName === targetField &&
          payload?.name
        ) {
          set({
            inspectorTarget: {
              entityName: targetEntity,
              fieldName: payload.name,
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
        set({
          compileError: error.message || 'Compilation failed',
          isCompiling: false,
        });
      }
    },

    initializeProject: async (projectId: string) => {
      try {
        const localData = await db.projects.get(projectId);
        const safeNotes = normalizeNotes(localData?.canonical_ir?.notes);
        const ir: CanonicalIR = {
          ...(localData ? localData.canonical_ir : DEFAULT_IR),
          customSql: localData?.canonical_ir?.customSql || [],
          notes: safeNotes as any,
        };
        set({
          projectId,
          projectName: 'untitled-workspace',
          present: ir,
          past: [],
          future: [],
          notes: safeNotes,
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
      const safeNotes = normalizeNotes(newIR.notes ?? present.notes);
      const safeIR: CanonicalIR = {
        ...newIR,
        customSql: newIR.customSql ?? present.customSql ?? [],
        notes: safeNotes as any,
      };
      set({
        past: [...past, present].slice(-50),
        present: safeIR,
        notes: safeNotes,
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
        notes: normalizeNotes(previous.notes),
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
        notes: normalizeNotes(next.notes),
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
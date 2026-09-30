import { StateCreator } from 'zustand';
import type { CanonicalIR, MasterAction } from '@zero-dollar/ir-core';
import { ShadowGraph } from '@zero-dollar/compiler/src/shadowGraph';
import { db } from '../../lib/db';
import { ReactFlowAdapter } from '../../lib/reactFlowAdapter';
import { SeedEngine } from '../../lib/seedEngine';
import { StoreState, HistorySlice } from '../types';
import { DEFAULT_IR, normalizeNotes, syncUINodes, normalizeAIRelations, persistToDB } from '../utils';

export const createHistorySlice: StateCreator<StoreState, [], [], HistorySlice> = (set, get) => ({
  projectId: null,
  projectName: 'untitled-workspace',
  past: [],
  present: DEFAULT_IR,
  future: [],
  syncStatus: 'synced',
  isDirty: false,

  setSyncStatus: (status) => set({ syncStatus: status }),
  markClean: () => set({ isDirty: false, syncStatus: 'synced' }),

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
      if (rel.sourceField && !sEnt.fields.some((f) => f.name === rel.sourceField)) return false;
      if (rel.targetField && !tEnt.fields.some((f) => f.name === rel.targetField)) return false;

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
    
    const normalizedIR = normalizeAIRelations({
      ...newIR,
      customSql: newIR.customSql ?? present.customSql ?? [],
      notes: safeNotes as any,
    });

    set({
      past: [...past, present].slice(-50),
      present: normalizedIR,
      notes: safeNotes,
      future: [],
      nodes: syncUINodes(normalizedIR, nodes),
      isDirty: true,
      syncStatus: 'syncing',
    });
    if (projectId) persistToDB(projectId, normalizedIR);
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

  dispatchManualAction: (command) => {
    const { present, applyAIPatch, inspectorTarget, activeTableName, showToast } = get();
    try {
      const cmd = command as any;

      if (cmd.action === 'ADD_CUSTOM_SQL') {
        applyAIPatch({ ...present, customSql: [...(present.customSql || []), cmd.payload] });
        return;
      }
      if (cmd.action === 'REMOVE_CUSTOM_SQL') {
        applyAIPatch({ ...present, customSql: (present.customSql || []).filter((s) => s.id !== cmd.id) });
        return;
      }
      if (cmd.action === 'UPDATE_CUSTOM_SQL') {
        applyAIPatch({
          ...present,
          customSql: (present.customSql || []).map((s) => (s.id === cmd.id ? { ...s, ...cmd.payload } : s)),
        });
        return;
      }

      const normalizedCommand: MasterAction =
        cmd.action === 'UPDATE_FIELD' && cmd.payload?.isPrimaryKey === true
          ? ({ ...cmd, payload: { ...cmd.payload, nullable: false } } as MasterAction)
          : (command as MasterAction);

      const targetEntity: string | undefined = cmd.targetEntity;
      const targetField: string | undefined = cmd.targetField;
      const payload: any = (normalizedCommand as any).payload;

      let simulatedIR = ShadowGraph.simulateAndValidate(present, [normalizedCommand]);

      if (cmd.action === 'REMOVE_FIELD' && targetEntity && targetField) {
        simulatedIR = {
          ...simulatedIR,
          relations: simulatedIR.relations.filter(
            (rel) =>
              !(rel.sourceEntity === targetEntity && rel.sourceField === targetField) &&
              !(rel.targetEntity === targetEntity && rel.targetField === targetField)
          ),
          entities: simulatedIR.entities.map((ent) => {
            if (ent.name !== targetEntity) return ent;
            const nextPk = ent.primaryKey?.filter((f) => f !== targetField);
            const nextIndexes = (ent.indexes || [])
              .map((idx) => ({ ...idx, fields: idx.fields.filter((f) => f !== targetField) }))
              .filter((idx) => idx.fields.length > 0);
            return {
              ...ent,
              primaryKey: nextPk && nextPk.length > 1 ? nextPk : undefined,
              indexes: nextIndexes,
            };
          }),
        };
      }

      if (cmd.action === 'ADD_RELATION' && payload) {
        const { sourceEntity, targetEntity: relTargetEnt, sourceField, targetField: relTargetField } = payload;
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
              sourceField: rel.sourceEntity === targetEntity && rel.sourceField === oldName ? newName : rel.sourceField,
              targetField: rel.targetEntity === targetEntity && rel.targetField === oldName ? newName : rel.targetField,
            })),
          };
        }
      }

      const syncedIR = SeedEngine.synchronizeSchemaAndData(present, simulatedIR);
      applyAIPatch(syncedIR);

      if (cmd.action === 'UPDATE_ENTITY' && payload?.name && targetEntity) {
        if (activeTableName === targetEntity) set({ activeTableName: payload.name });
        if (inspectorTarget?.entityName === targetEntity) {
          set({ inspectorTarget: { ...inspectorTarget, entityName: payload.name } });
        }
      }

      if (cmd.action === 'REMOVE_ENTITY' && targetEntity) {
        if (activeTableName === targetEntity) set({ activeTableName: null });
        if (inspectorTarget?.entityName === targetEntity) set({ inspectorTarget: null });
      }

      if (
        cmd.action === 'UPDATE_FIELD' &&
        inspectorTarget?.entityName === targetEntity &&
        inspectorTarget?.fieldName === targetField &&
        payload?.name
      ) {
        set({ inspectorTarget: { entityName: targetEntity, fieldName: payload.name } });
      }
    } catch (error: any) {
      console.error('Manual action rejected:', error.message);
      showToast(error.message);
    }
  },
});
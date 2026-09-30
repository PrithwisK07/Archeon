import { StateCreator } from 'zustand';
import type { CanonicalIR } from '@zero-dollar/ir-core';
import { SeedEngine } from '../../lib/seedEngine';
import { StoreState, DataEngineSlice } from '../types';
import { syncUINodes, persistToDB } from '../utils';

export const createDataEngineSlice: StateCreator<StoreState, [], [], DataEngineSlice> = (set, get) => ({
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
    const { present, projectId, nodes, showToast } = get();
    try {
      const newIR = SeedEngine.updateCellWithIntegrity(present, entityName, rowIndex, fieldName, value);
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

    const parentEnt = workingIR.entities.find((e) => e.name === parentEntityName);
    const childEnt = workingIR.entities.find((e) => e.name === childEntityName);
    if (!parentEnt || !childEnt) return;

    const incompleteGroups = SeedEngine.getIncompleteCompositeRelations(workingIR).filter(
      (g) => g.parentEntity === parentEntityName && g.childEntity === childEntityName
    );
    if (incompleteGroups.length === 0) return;

    const group = incompleteGroups[0];
    const prefix = parentEntityName.toLowerCase().replace(/s$/, '');

    for (const missingPk of group.missingParentPkFields) {
      const parentField = parentEnt.fields.find((f) => f.name === missingPk);
      if (!parentField) continue;

      let targetFkField = childEnt.fields.find(
        (f) => f.name === missingPk || f.name === `${prefix}_${missingPk}`
      );

      if (!targetFkField) {
        const newFieldName = missingPk === 'id' ? `${prefix}_id` : missingPk;
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
    showToast(`Completed composite foreign key from ${parentEntityName} → ${childEntityName}`);
  },
});
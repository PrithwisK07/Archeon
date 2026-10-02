import type { CanonicalIR } from '@zero-dollar/ir-core';
import {
  ResolvedRelation,
  SeedResult,
  getEntityPkFields,
  getRowCompositeKey,
  resolveAllRelations,
  resolveCompositeGroups,
} from './relationResolver';
import { evaluateDefaultValue } from './valueGenerator';

export function deleteRowWithIntegrity(
  ir: CanonicalIR,
  entityName: string,
  rowIndex: number
): SeedResult {
  const workingIR: CanonicalIR = JSON.parse(JSON.stringify(ir));
  const entity = workingIR.entities.find((e) => e.name === entityName);
  if (!entity || !entity.seedData || !entity.seedData[rowIndex]) {
    return { ir: workingIR, message: 'Row not found' };
  }

  const resolvedRels = resolveAllRelations(workingIR);
  const targetRow = entity.seedData[rowIndex];
  entity.seedData.splice(rowIndex, 1);

  const cascaded = applyReferentialDeleteActions(
    workingIR,
    resolvedRels,
    entityName,
    [targetRow]
  );

  const suffix = cascaded > 0 ? ` (cascaded ${cascaded} dependent row(s))` : '';
  return { ir: workingIR, message: `Row removed${suffix}` };
}

export function clearTableWithIntegrity(
  ir: CanonicalIR,
  entityName: string
): SeedResult {
  let workingIR: CanonicalIR = JSON.parse(JSON.stringify(ir));
  const entity = workingIR.entities.find((e) => e.name === entityName);
  if (!entity || !entity.seedData?.length) {
    return { ir: workingIR, message: `Cleared data for ${entityName}` };
  }

  const resolvedRels = resolveAllRelations(workingIR);
  const originalRows = [...entity.seedData];
  const keptRows: Record<string, any>[] = [];
  let deletedCount = 0;
  let totalCascaded = 0;

  for (const row of originalRows) {
    const snapshotIR: CanonicalIR = JSON.parse(JSON.stringify(workingIR));
    try {
      const snapEnt = snapshotIR.entities.find((e) => e.name === entityName)!;
      const targetRowKey = getRowCompositeKey(snapEnt, row);

      snapEnt.seedData = (snapEnt.seedData || []).filter(
        (r) => getRowCompositeKey(snapEnt, r) !== targetRowKey
      );

      const cascaded = applyReferentialDeleteActions(
        snapshotIR,
        resolvedRels,
        entityName,
        [row]
      );

      workingIR = snapshotIR;
      deletedCount++;
      totalCascaded += cascaded;
    } catch {
      keptRows.push(row);
    }
  }

  const finalEntity = workingIR.entities.find((e) => e.name === entityName)!;
  finalEntity.seedData = keptRows;

  if (deletedCount === 0 && keptRows.length > 0) {
    throw new Error(
      `Cannot clear "${entityName}": all ${keptRows.length} row(s) are referenced by child tables (RESTRICT)`
    );
  }

  if (keptRows.length > 0) {
    return {
      ir: workingIR,
      message: `Cleared ${deletedCount} row(s) from ${entityName} (${keptRows.length} kept due to FK RESTRICT)`,
    };
  }

  const suffix = totalCascaded > 0 ? ` (cascaded ${totalCascaded} dependent row(s))` : '';
  return { ir: workingIR, message: `Cleared data for ${entityName}${suffix}` };
}

export function applyReferentialDeleteActions(
  workingIR: CanonicalIR,
  resolvedRels: ResolvedRelation[],
  entityName: string,
  deletingRows: Record<string, any>[],
  visited = new Set<string>() 
): number {
  let totalCascaded = 0;
  const activeRels = resolvedRels.filter((r) => r.isCompleteComposite);
  const outgoingGroups = resolveCompositeGroups(workingIR, activeRels).filter(
    (g) => g.parentEntity === entityName && g.isComplete
  );

  for (const group of outgoingGroups) {
    const childEntity = workingIR.entities.find((e) => e.name === group.childEntity);
    if (!childEntity || !childEntity.seedData?.length) continue;

    const deletingTupleSet = new Set(
      deletingRows.map((pRow) =>
        group.mappings.map((m) => String(pRow[m.parentPkField] ?? pRow.id)).join('::')
      )
    );

    const isChildRowDependent = (cRow: Record<string, any>): boolean => {
      if (
        group.mappings.some(
          (m) => cRow[m.childFkField] === null || cRow[m.childFkField] === undefined
        )
      ) {
        return false;
      }
      const childTuple = group.mappings.map((m) => String(cRow[m.childFkField])).join('::');
      return deletingTupleSet.has(childTuple);
    };

    const dependentRows = childEntity.seedData.filter((cRow) => {
      if (!isChildRowDependent(cRow)) return false;
      const uniqueRowKey = `${childEntity.name}::${getRowCompositeKey(childEntity, cRow)}`;
      if (visited.has(uniqueRowKey)) return false; // Break the cycle
      return true;
    });

    if (dependentRows.length === 0) continue;

    const rule = group.onDelete || 'RESTRICT';
    const childColsLabel = group.mappings.map((m) => m.childFkField).join(', ');
    const parentColsLabel = group.mappings.map((m) => m.parentPkField).join(', ');

    if (rule === 'RESTRICT') {
      throw new Error(
        `Foreign key constraint violation: ${dependentRows.length} row(s) in "${childEntity.name} (${childColsLabel})" reference "${entityName} (${parentColsLabel})" (RESTRICT)`
      );
    } else if (rule === 'CASCADE') {
      totalCascaded += dependentRows.length;
      
      dependentRows.forEach((r) => {
        visited.add(`${childEntity.name}::${getRowCompositeKey(childEntity, r)}`);
      });

      childEntity.seedData = childEntity.seedData.filter((r) => !isChildRowDependent(r));
      totalCascaded += applyReferentialDeleteActions(
        workingIR,
        resolvedRels,
        childEntity.name,
        dependentRows,
        visited // Pass the set down
      );
    } else if (rule === 'SET NULL') {
      for (const m of group.mappings) {
        const fkFieldDef = childEntity.fields.find((f) => f.name === m.childFkField);
        const childPkFields = getEntityPkFields(childEntity);
        if ((fkFieldDef && !fkFieldDef.nullable) || childPkFields.includes(m.childFkField)) {
          throw new Error(
            `Cannot SET NULL on non-nullable or Primary Key column "${childEntity.name}.${m.childFkField}"`
          );
        }
      }
      childEntity.seedData = childEntity.seedData.map((r) => {
        if (!isChildRowDependent(r)) return r;
        const patched = { ...r };
        group.mappings.forEach((m) => {
          patched[m.childFkField] = null;
        });
        return patched;
      });
    } else if (rule === 'SET DEFAULT') {
      childEntity.seedData = childEntity.seedData.map((r) => {
        if (!isChildRowDependent(r)) return r;
        const patched = { ...r };
        group.mappings.forEach((m) => {
          const fkFieldDef = childEntity.fields.find((f) => f.name === m.childFkField);
          patched[m.childFkField] = fkFieldDef ? evaluateDefaultValue(fkFieldDef) : null;
        });
        return patched;
      });
    }
  }

  return totalCascaded;
}
import { faker } from '@faker-js/faker';
import type { CanonicalIR } from '@zero-dollar/ir-core';
import {
  ResolvedRelation,
  SeedResult,
  isFieldPk,
  resolveAllRelations,
} from './relationResolver';
import {
  coerceCellValue,
  evaluateDefaultValue,
  generateFieldValue,
} from './valueGenerator';

/**
 * Re-binds any orphaned FK values in existing child rows to valid parent PK values.
 */
export function reconcileAllForeignKeys(
  workingIR: CanonicalIR,
  resolvedRels = resolveAllRelations(workingIR)
): void {
  for (const rel of resolvedRels) {
    const parentEnt = workingIR.entities.find((e) => e.name === rel.parentEntity);
    const childEnt = workingIR.entities.find((e) => e.name === rel.childEntity);
    if (!parentEnt?.seedData?.length || !childEnt?.seedData?.length) continue;

    const validParentValues = parentEnt.seedData
      .map((r) => r[rel.parentPkField] ?? r.id)
      .filter((v) => v !== undefined && v !== null);
    if (validParentValues.length === 0) continue;

    const validSet = new Set(validParentValues.map((v) => String(v)));
    const fkFieldDef = childEnt.fields.find((f) => f.name === rel.childFkField);

    const usedInOneToOne = new Set<string>();
    if (rel.type === 'ONE_TO_ONE') {
      childEnt.seedData.forEach((r) => {
        const val = r[rel.childFkField];
        if (val !== undefined && val !== null && validSet.has(String(val))) {
          usedInOneToOne.add(String(val));
        }
      });
    }

    childEnt.seedData = childEnt.seedData.map((row) => {
      const currentFk = row[rel.childFkField];
      if (currentFk === null && fkFieldDef?.nullable) return row;
      if (currentFk !== undefined && currentFk !== null && validSet.has(String(currentFk))) {
        return row;
      }

      if (rel.type === 'ONE_TO_ONE') {
        const available = validParentValues.filter((v) => !usedInOneToOne.has(String(v)));
        const replacement =
          available.length > 0
            ? faker.helpers.arrayElement(available)
            : faker.helpers.arrayElement(validParentValues);
        usedInOneToOne.add(String(replacement));
        return { ...row, [rel.childFkField]: replacement };
      }

      return {
        ...row,
        [rel.childFkField]: faker.helpers.arrayElement(validParentValues),
      };
    });
  }
}

/**
 * Keeps `entity.seedData` consistent when columns are added, renamed, re-typed, or removed.
 */
export function synchronizeSchemaAndData(
  prevIR: CanonicalIR,
  nextIR: CanonicalIR
): CanonicalIR {
  const syncedIR: CanonicalIR = JSON.parse(JSON.stringify(nextIR));
  const resolvedRels = resolveAllRelations(syncedIR);

  for (const nextEnt of syncedIR.entities) {
    const prevEnt = prevIR.entities.find((e) => e.name === nextEnt.name);
    if (!nextEnt.seedData || nextEnt.seedData.length === 0) continue;

    const prevFields = prevEnt?.fields || [];
    let renamedFrom: string | null = null;
    let renamedTo: string | null = null;
    if (prevFields.length === nextEnt.fields.length) {
      for (let i = 0; i < nextEnt.fields.length; i++) {
        if (prevFields[i].name !== nextEnt.fields[i].name) {
          renamedFrom = prevFields[i].name;
          renamedTo = nextEnt.fields[i].name;
        }
      }
    }

    nextEnt.seedData = nextEnt.seedData.map((oldRow, rowIdx) => {
      const updatedRow: Record<string, any> = {};

      if (renamedFrom && renamedTo && oldRow[renamedFrom] !== undefined) {
        oldRow[renamedTo] = oldRow[renamedFrom];
      }

      for (const field of nextEnt.fields) {
        let val = oldRow[field.name];
        if (val === undefined) {
          val = generateFieldValue(
            syncedIR,
            resolvedRels,
            nextEnt,
            field,
            nextEnt.seedData!.slice(0, rowIdx),
            updatedRow
          );
        } else {
          val = coerceCellValue(field, val);
        }
        updatedRow[field.name] = val;
      }

      return updatedRow;
    });
  }

  reconcileAllForeignKeys(syncedIR, resolvedRels);
  return syncedIR;
}

/**
 * Validates PK, @unique, 1:1 FK, NOT NULL, and Foreign Key constraints for a candidate row.
 */
export function validateRowConstraints(
  ir: CanonicalIR,
  entityName: string,
  candidateRow: Record<string, any>,
  excludeRowIndex = -1
): void {
  const entity = ir.entities.find((e) => e.name === entityName);
  if (!entity) return;

  const existingRows = (entity.seedData || []).filter((_, idx) => idx !== excludeRowIndex);
  const resolvedRels = resolveAllRelations(ir);
  const incomingRels = resolvedRels.filter((r) => r.childEntity === entityName);
  const fkFieldSet = new Set(incomingRels.map((r) => r.childFkField));

  for (const field of entity.fields) {
    const val = candidateRow[field.name];
    const isFk = fkFieldSet.has(field.name);
    const isPk = !isFk && isFieldPk(field);

    if (!field.nullable && (val === null || val === undefined || val === '')) {
      throw new Error(`NOT NULL violation: "${entityName}.${field.name}" cannot be empty`);
    }

    if (val === null || val === undefined || val === '') continue;

    const enforceUnique = isPk || (field.unique && !(isFk && field.name === 'id'));
    if (enforceUnique) {
      const duplicate = existingRows.some((r) => String(r[field.name]) === String(val));
      if (duplicate) {
        throw new Error(
          `Unique constraint violation on "${entityName}.${field.name}": value "${val}" already exists`
        );
      }
    }
  }

  for (const rel of incomingRels) {
    const fkVal = candidateRow[rel.childFkField];
    const fkFieldDef = entity.fields.find((f) => f.name === rel.childFkField);

    if (fkVal === undefined || fkVal === null || fkVal === '') {
      if (!fkFieldDef?.nullable) {
        throw new Error(
          `Foreign key violation: "${entityName}.${rel.childFkField}" cannot be null`
        );
      }
      continue;
    }

    const parentEntity = ir.entities.find((e) => e.name === rel.parentEntity);
    if (!parentEntity) continue;

    const parentRows = parentEntity.seedData || [];
    const existsInParent = parentRows.some(
      (r) => String(r[rel.parentPkField] ?? r.id) === String(fkVal)
    );
    if (!existsInParent) {
      throw new Error(
        `Foreign key violation on "${entityName}.${rel.childFkField}": value "${fkVal}" does not exist in "${rel.parentEntity}.${rel.parentPkField}"`
      );
    }

    if (rel.type === 'ONE_TO_ONE') {
      const alreadyUsed = existingRows.some(
        (r) => String(r[rel.childFkField]) === String(fkVal)
      );
      if (alreadyUsed) {
        throw new Error(
          `1:1 cardinality violation on "${entityName}.${rel.childFkField}": parent key "${fkVal}" is already linked to another row`
        );
      }
    }
  }
}

export function updateCellWithIntegrity(
  ir: CanonicalIR,
  entityName: string,
  rowIndex: number,
  fieldName: string,
  rawValue: any
): CanonicalIR {
  const workingIR: CanonicalIR = JSON.parse(JSON.stringify(ir));
  const entity = workingIR.entities.find((e) => e.name === entityName);
  if (!entity || !entity.seedData || !entity.seedData[rowIndex]) return workingIR;

  const fieldDef = entity.fields.find((f) => f.name === fieldName);
  const coercedValue = coerceCellValue(fieldDef, rawValue);
  const oldValue = entity.seedData[rowIndex][fieldName];

  if (coercedValue === oldValue) return workingIR;

  const candidateRow = { ...entity.seedData[rowIndex], [fieldName]: coercedValue };

  if (coercedValue !== '') {
    validateRowConstraints(workingIR, entityName, candidateRow, rowIndex);
  }

  entity.seedData[rowIndex] = candidateRow;

  // ON UPDATE CASCADE for referencing child rows
  if (oldValue !== undefined && oldValue !== '' && coercedValue !== '') {
    const outgoingRels = resolveAllRelations(workingIR).filter(
      (r) => r.parentEntity === entityName && r.parentPkField === fieldName
    );
    for (const rel of outgoingRels) {
      const childEnt = workingIR.entities.find((e) => e.name === rel.childEntity);
      if (!childEnt?.seedData) continue;
      childEnt.seedData = childEnt.seedData.map((cRow) =>
        String(cRow[rel.childFkField]) === String(oldValue)
          ? { ...cRow, [rel.childFkField]: coercedValue }
          : cRow
      );
    }
  }

  return workingIR;
}

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

export function clearTableWithIntegrity(ir: CanonicalIR, entityName: string): SeedResult {
  const workingIR: CanonicalIR = JSON.parse(JSON.stringify(ir));
  const entity = workingIR.entities.find((e) => e.name === entityName);
  if (!entity || !entity.seedData?.length) {
    return { ir: workingIR, message: `Cleared data for ${entityName}` };
  }

  const resolvedRels = resolveAllRelations(workingIR);
  const deletingRows = [...entity.seedData];
  entity.seedData = [];

  const cascaded = applyReferentialDeleteActions(
    workingIR,
    resolvedRels,
    entityName,
    deletingRows
  );

  const suffix = cascaded > 0 ? ` (cascaded ${cascaded} dependent row(s))` : '';
  return { ir: workingIR, message: `Cleared data for ${entityName}${suffix}` };
}

function applyReferentialDeleteActions(
  workingIR: CanonicalIR,
  resolvedRels: ResolvedRelation[],
  entityName: string,
  deletingRows: Record<string, any>[]
): number {
  let totalCascaded = 0;
  const outgoingRels = resolvedRels.filter((r) => r.parentEntity === entityName);

  for (const rel of outgoingRels) {
    const childEntity = workingIR.entities.find((e) => e.name === rel.childEntity);
    if (!childEntity || !childEntity.seedData?.length) continue;

    const deletingKeySet = new Set(
      deletingRows.map((r) => String(r[rel.parentPkField] ?? r.id))
    );
    const dependentRows = childEntity.seedData.filter(
      (r) =>
        r[rel.childFkField] !== null &&
        r[rel.childFkField] !== undefined &&
        deletingKeySet.has(String(r[rel.childFkField]))
    );
    if (dependentRows.length === 0) continue;

    const rule = rel.onDelete || 'RESTRICT';
    const fkFieldDef = childEntity.fields.find((f) => f.name === rel.childFkField);

    if (rule === 'RESTRICT') {
      throw new Error(
        `Foreign key constraint violation: ${dependentRows.length} row(s) in "${childEntity.name}.${rel.childFkField}" reference "${entityName}.${rel.parentPkField}" (RESTRICT)`
      );
    } else if (rule === 'CASCADE') {
      totalCascaded += dependentRows.length;
      childEntity.seedData = childEntity.seedData.filter(
        (r) => !deletingKeySet.has(String(r[rel.childFkField]))
      );
      totalCascaded += applyReferentialDeleteActions(
        workingIR,
        resolvedRels,
        childEntity.name,
        dependentRows
      );
    } else if (rule === 'SET NULL') {
      if (fkFieldDef && !fkFieldDef.nullable) {
        throw new Error(
          `Cannot SET NULL on non-nullable column "${childEntity.name}.${rel.childFkField}"`
        );
      }
      childEntity.seedData = childEntity.seedData.map((r) =>
        deletingKeySet.has(String(r[rel.childFkField]))
          ? { ...r, [rel.childFkField]: null }
          : r
      );
    } else if (rule === 'SET DEFAULT') {
      const fallbackVal = fkFieldDef ? evaluateDefaultValue(fkFieldDef) : null;
      childEntity.seedData = childEntity.seedData.map((r) =>
        deletingKeySet.has(String(r[rel.childFkField]))
          ? { ...r, [rel.childFkField]: fallbackVal }
          : r
      );
    }
  }

  return totalCascaded;
}
import { faker } from '@faker-js/faker';
import type { CanonicalIR } from '@zero-dollar/ir-core';
import {
  getEntityPkFields,
  isFieldPk,
  resolveAllRelations,
  resolveCompositeGroups,
} from './relationResolver';
import {
  coerceCellValue,
  generateFieldValue,
} from './valueGenerator';

/**
 * Re-binds any orphaned single or composite FK values in existing child rows to valid parent rows.
 */
export function reconcileAllForeignKeys(
  workingIR: CanonicalIR,
  resolvedRels = resolveAllRelations(workingIR)
): void {
  const activeRels = resolvedRels.filter((r) => r.isCompleteComposite);
  const groups = resolveCompositeGroups(workingIR, activeRels).filter((g) => g.isComplete);

  for (const group of groups) {
    const parentEnt = workingIR.entities.find((e) => e.name === group.parentEntity);
    const childEnt = workingIR.entities.find((e) => e.name === group.childEntity);
    if (!parentEnt?.seedData?.length || !childEnt?.seedData?.length) continue;

    const parentRows = parentEnt.seedData;

    // 1. Multi-Column Composite FK Reconciliation (atomic tuple matching)
    if (group.mappings.length > 1) {
      const validTuples = new Set(
        parentRows.map((pRow) =>
          group.mappings.map((m) => String(pRow[m.parentPkField] ?? '')).join('::')
        )
      );

      childEnt.seedData = childEnt.seedData.map((cRow) => {
        const childTuple = group.mappings
          .map((m) => String(cRow[m.childFkField] ?? ''))
          .join('::');

        if (validTuples.has(childTuple)) return cRow;

        const chosenParent = faker.helpers.arrayElement(parentRows);
        const patched = { ...cRow };
        group.mappings.forEach((m) => {
          patched[m.childFkField] = chosenParent[m.parentPkField];
        });
        return patched;
      });
      continue;
    }

    // 2. Standard Single-Column FK Reconciliation
    const mapping = group.mappings[0];
    const validParentValues = parentRows
      .map((r) => r[mapping.parentPkField] ?? r.id)
      .filter((v) => v !== undefined && v !== null);
    if (validParentValues.length === 0) continue;

    const validSet = new Set(validParentValues.map((v) => String(v)));
    const fkFieldDef = childEnt.fields.find((f) => f.name === mapping.childFkField);

    const usedInOneToOne = new Set<string>();
    if (group.type === 'ONE_TO_ONE') {
      childEnt.seedData.forEach((r) => {
        const val = r[mapping.childFkField];
        if (val !== undefined && val !== null && validSet.has(String(val))) {
          usedInOneToOne.add(String(val));
        }
      });
    }

    childEnt.seedData = childEnt.seedData.map((row) => {
      const currentFk = row[mapping.childFkField];
      if (currentFk === null && fkFieldDef?.nullable) return row;
      if (currentFk !== undefined && currentFk !== null && validSet.has(String(currentFk))) {
        return row;
      }

      if (group.type === 'ONE_TO_ONE') {
        const available = validParentValues.filter((v) => !usedInOneToOne.has(String(v)));
        const replacement =
          available.length > 0
            ? faker.helpers.arrayElement(available)
            : faker.helpers.arrayElement(validParentValues);
        usedInOneToOne.add(String(replacement));
        return { ...row, [mapping.childFkField]: replacement };
      }

      return {
        ...row,
        [mapping.childFkField]: faker.helpers.arrayElement(validParentValues),
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
  syncedIR.notes = nextIR.notes ?? prevIR.notes ?? [];
  syncedIR.customSql = nextIR.customSql ?? prevIR.customSql ?? [];

  for (const nextEnt of syncedIR.entities) {
    const prevEnt = prevIR.entities.find((e) => e.name === nextEnt.name);
    if (!nextEnt.seedData && prevEnt?.seedData) {
      nextEnt.seedData = JSON.parse(JSON.stringify(prevEnt.seedData));
    }
  }

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
 * Validates single & composite PKs, @unique columns, @@unique composite indexes,
 * NOT NULL constraints, and single & composite Foreign Key existence.
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
  const resolvedRels = resolveAllRelations(ir).filter((r) => r.isCompleteComposite);
  const incomingRels = resolvedRels.filter((r) => r.childEntity === entityName);
  const fkFieldSet = new Set(incomingRels.map((r) => r.childFkField));

  const pkFields = getEntityPkFields(entity);
  const isCompositePk = pkFields.length > 1;

  // 1. Field-level NOT NULL & Single-Column Uniqueness
  for (const field of entity.fields) {
    const val = candidateRow[field.name];
    const isFk = fkFieldSet.has(field.name);
    const isMemberOfPk = pkFields.includes(field.name);
    const isSinglePk = !isCompositePk && !isFk && isFieldPk(field);

    if ((!field.nullable || isMemberOfPk) && (val === null || val === undefined || val === '')) {
      throw new Error(`NOT NULL violation: "${entityName}.${field.name}" cannot be empty`);
    }

    if (val === null || val === undefined || val === '') continue;

    const hasSingleUniqueIndex = entity.indexes?.some(
      (idx) => idx.unique && idx.fields.length === 1 && idx.fields[0] === field.name
    );
    const enforceSingleUnique =
      isSinglePk || hasSingleUniqueIndex || (field.unique && !(isFk && field.name === 'id'));

    if (enforceSingleUnique) {
      const duplicate = existingRows.some((r) => String(r[field.name]) === String(val));
      if (duplicate) {
        throw new Error(
          `Unique constraint violation on "${entityName}.${field.name}": value "${val}" already exists`
        );
      }
    }
  }

  // 2. Composite Primary Key (@@id) Tuple Uniqueness
  if (isCompositePk) {
    const candidateTuple = pkFields.map((k) => String(candidateRow[k] ?? '')).join('::');
    const duplicatePkTuple = existingRows.some(
      (r) => pkFields.map((k) => String(r[k] ?? '')).join('::') === candidateTuple
    );
    if (duplicatePkTuple) {
      throw new Error(
        `Composite Primary Key violation on "${entityName} (${pkFields.join(', ')})": tuple (${pkFields
          .map((k) => candidateRow[k])
          .join(', ')}) already exists`
      );
    }
  }

  // 3. Composite Unique Indexes (@@unique) Tuple Uniqueness
  for (const idx of entity.indexes || []) {
    if (!idx.unique || idx.fields.length <= 1) continue;
    if (idx.fields.some((f) => candidateRow[f] === null || candidateRow[f] === undefined)) {
      continue;
    }
    const candidateTuple = idx.fields.map((k) => String(candidateRow[k])).join('::');
    const duplicateIdxTuple = existingRows.some(
      (r) => idx.fields.map((k) => String(r[k])).join('::') === candidateTuple
    );
    if (duplicateIdxTuple) {
      throw new Error(
        `Composite Unique Index violation on "${entityName} (${idx.fields.join(', ')})": combination (${idx.fields
          .map((k) => candidateRow[k])
          .join(', ')}) already exists`
      );
    }
  }

  // 4. Single & Composite Foreign Key Validation
  const incomingGroups = resolveCompositeGroups(ir, incomingRels).filter(
    (g) => g.childEntity === entityName && g.isComplete
  );

  for (const group of incomingGroups) {
    const parentEntity = ir.entities.find((e) => e.name === group.parentEntity);
    if (!parentEntity) continue;
    const parentRows = parentEntity.seedData || [];

    if (group.mappings.length > 1) {
      const allNull = group.mappings.every(
        (m) =>
          candidateRow[m.childFkField] === null ||
          candidateRow[m.childFkField] === undefined ||
          candidateRow[m.childFkField] === ''
      );
      if (allNull) continue;

      const existsTupleInParent = parentRows.some((pRow) =>
        group.mappings.every(
          (m) => String(pRow[m.parentPkField]) === String(candidateRow[m.childFkField])
        )
      );

      if (!existsTupleInParent) {
        const childCols = group.mappings.map((m) => m.childFkField).join(', ');
        const parentCols = group.mappings.map((m) => m.parentPkField).join(', ');
        const vals = group.mappings.map((m) => candidateRow[m.childFkField]).join(', ');
        throw new Error(
          `Composite Foreign Key violation on "${entityName} (${childCols})": tuple (${vals}) does not exist in "${group.parentEntity} (${parentCols})"`
        );
      }
      continue;
    }

    const mapping = group.mappings[0];
    const fkVal = candidateRow[mapping.childFkField];
    const fkFieldDef = entity.fields.find((f) => f.name === mapping.childFkField);

    if (fkVal === undefined || fkVal === null || fkVal === '') {
      if (!fkFieldDef?.nullable) {
        throw new Error(
          `Foreign key violation: "${entityName}.${mapping.childFkField}" cannot be null`
        );
      }
      continue;
    }

    const existsInParent = parentRows.some(
      (r) => String(r[mapping.parentPkField] ?? r.id) === String(fkVal)
    );
    if (!existsInParent) {
      throw new Error(
        `Foreign key violation on "${entityName}.${mapping.childFkField}": value "${fkVal}" does not exist in "${group.parentEntity}.${mapping.parentPkField}"`
      );
    }

    if (group.type === 'ONE_TO_ONE') {
      const alreadyUsed = existingRows.some(
        (r) => String(r[mapping.childFkField]) === String(fkVal)
      );
      if (alreadyUsed) {
        throw new Error(
          `1:1 cardinality violation on "${entityName}.${mapping.childFkField}": parent key "${fkVal}" is already linked to another row`
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
      (r) =>
        r.isCompleteComposite &&
        r.parentEntity === entityName &&
        r.parentPkField === fieldName
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
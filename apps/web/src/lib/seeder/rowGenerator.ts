import { faker } from '@faker-js/faker';
import type { CanonicalIR, Entity } from '@zero-dollar/ir-core';
import { ResolvedRelation, isFieldPk } from './relationResolver';
import { generateUniqueFieldValue } from './valueGenerator';

/**
 * Generates `count` valid rows for `entity`, enforcing single-column uniqueness,
 * 1:1 FK uniqueness, composite PK / @@unique tuples, and temporal ordering.
 */
export function generateRowsForEntity(
  ir: CanonicalIR,
  resolvedRelations: ResolvedRelation[],
  entity: Entity,
  existingRows: Record<string, any>[],
  count: number
): Record<string, any>[] {
  const newRows: Record<string, any>[] = [];

  const childFkFields = new Set<string>();
  const oneToOneFkFields = new Set<string>();
  resolvedRelations.forEach((rel) => {
    if (rel.childEntity === entity.name) {
      childFkFields.add(rel.childFkField);
      if (rel.type === 'ONE_TO_ONE') {
        oneToOneFkFields.add(rel.childFkField);
      }
    }
  });

  const uniqueSets = new Map<string, Set<any>>();
  entity.fields.forEach((f) => {
    const isFk = childFkFields.has(f.name);
    const isPk = !isFk && isFieldPk(f);
    const isUniqueNonFkId = f.unique && !(isFk && f.name === 'id');

    if (isPk || isUniqueNonFkId || oneToOneFkFields.has(f.name)) {
      uniqueSets.set(
        f.name,
        new Set(
          existingRows
            .map((r) => r[f.name])
            .filter((v) => v !== undefined && v !== null)
        )
      );
    }
  });

  const compositeTuples = new Set<string>();
  const compositeFieldGroups: string[][] = [];
  if (entity.primaryKey && entity.primaryKey.length > 1) {
    compositeFieldGroups.push(entity.primaryKey);
  }
  entity.indexes?.forEach((idx) => {
    if (idx.unique && idx.fields.length > 1) {
      compositeFieldGroups.push(idx.fields);
    }
  });

  existingRows.forEach((r) => {
    compositeFieldGroups.forEach((group, gIdx) => {
      const key = `${gIdx}:${group.map((f) => r[f]).join('|')}`;
      compositeTuples.add(key);
    });
  });

  for (let i = 0; i < count; i++) {
    let row: Record<string, any> = {};
    let compositeValid = true;
    let rowAttempt = 0;
    const allAvailableRows = [...existingRows, ...newRows];

    while (rowAttempt < 20) {
      row = {};
      compositeValid = true;

      // Pass A: True Primary Keys (excluding any column acting as a Foreign Key)
      for (const field of entity.fields) {
        const isFk = childFkFields.has(field.name);
        if (!isFk && isFieldPk(field)) {
          row[field.name] = generateUniqueFieldValue(
            ir,
            resolvedRelations,
            entity,
            field,
            allAvailableRows,
            row,
            uniqueSets.get(field.name),
            false
          );
        }
      }

      // Pass B: Foreign Keys & Standard Columns
      for (const field of entity.fields) {
        const isFk = childFkFields.has(field.name);
        if (!isFk && isFieldPk(field)) continue;
        row[field.name] = generateUniqueFieldValue(
          ir,
          resolvedRelations,
          entity,
          field,
          allAvailableRows,
          row,
          uniqueSets.get(field.name),
          oneToOneFkFields.has(field.name)
        );
      }

      if (row.id === undefined) {
        row.id = faker.string.uuid();
      }

      for (const field of entity.fields) {
        const uSet = uniqueSets.get(field.name);
        if (uSet && row[field.name] !== null && uSet.has(row[field.name])) {
          compositeValid = false;
          break;
        }
      }

      if (compositeValid) {
        for (let gIdx = 0; gIdx < compositeFieldGroups.length; gIdx++) {
          const group = compositeFieldGroups[gIdx];
          const tupleKey = `${gIdx}:${group.map((f) => row[f]).join('|')}`;
          if (compositeTuples.has(tupleKey)) {
            compositeValid = false;
            break;
          }
        }
      }

      if (compositeValid) break;
      rowAttempt++;
    }

    if (!compositeValid) break;

    entity.fields.forEach((f) => {
      const uSet = uniqueSets.get(f.name);
      if (uSet && row[f.name] !== null && row[f.name] !== undefined) {
        uSet.add(row[f.name]);
      }
    });
    compositeFieldGroups.forEach((group, gIdx) => {
      const tupleKey = `${gIdx}:${group.map((f) => row[f]).join('|')}`;
      compositeTuples.add(tupleKey);
    });

    // Temporal Coherence: updated_at / expires_at >= created_at
    const createdField = entity.fields.find(
      (f) => f.type === 'datetime' && /^created(_?at)?$/i.test(f.name)
    );
    if (createdField && row[createdField.name]) {
      const createdTime = new Date(row[createdField.name]).getTime();
      for (const f of entity.fields) {
        if (
          f.type === 'datetime' &&
          /(updated|expires|deleted|completed)(_?at)?$/i.test(f.name) &&
          row[f.name]
        ) {
          const futureDate = new Date(
            createdTime + faker.number.int({ min: 3600000, max: 7 * 86400000 })
          );
          row[f.name] = futureDate.toISOString();
        }
      }
    }

    newRows.push(row);
  }

  return newRows;
}
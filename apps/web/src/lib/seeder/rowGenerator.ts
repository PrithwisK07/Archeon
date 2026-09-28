import { faker } from '@faker-js/faker';
import type { CanonicalIR, Entity } from '@zero-dollar/ir-core';
import {
  ResolvedRelation,
  getEntityPkFields,
  isFieldPk,
  resolveCompositeGroups,
} from './relationResolver';
import { generateUniqueFieldValue } from './valueGenerator';

/**
 * Generates `count` valid rows for `entity`, enforcing single-column uniqueness,
 * 1:1 FK uniqueness, composite PK / @@unique tuples, and atomic composite FKs.
 */
export function generateRowsForEntity(
  ir: CanonicalIR,
  resolvedRelations: ResolvedRelation[],
  entity: Entity,
  existingRows: Record<string, any>[],
  count: number
): Record<string, any>[] {
  const newRows: Record<string, any>[] = [];
  const pkFields = getEntityPkFields(entity);
  const isCompositePk = pkFields.length > 1;

  // Only consider complete relations for FK enforcement
  const activeRelations = resolvedRelations.filter((r) => r.isCompleteComposite);
  const compositeGroups = resolveCompositeGroups(ir, activeRelations).filter(
    (g) => g.childEntity === entity.name && g.isComplete && g.mappings.length > 1
  );

  const childFkFields = new Set<string>();
  const oneToOneFkFields = new Set<string>();
  activeRelations.forEach((rel) => {
    if (rel.childEntity === entity.name) {
      childFkFields.add(rel.childFkField);
      if (rel.type === 'ONE_TO_ONE' && !rel.isCompositeParent) {
        oneToOneFkFields.add(rel.childFkField);
      }
    }
  });

  // Single-column uniqueness sets (do NOT put individual columns of a Composite PK here!)
  const uniqueSets = new Map<string, Set<any>>();
  entity.fields.forEach((f) => {
    const isFk = childFkFields.has(f.name);
    const isSinglePk = !isCompositePk && !isFk && isFieldPk(f);
    const isUniqueNonFkId = f.unique && !(isFk && f.name === 'id');

    if (isSinglePk || isUniqueNonFkId || oneToOneFkFields.has(f.name)) {
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

  // Composite tuple uniqueness sets (Composite PK + Composite @@unique indexes)
  const compositeTuples = new Set<string>();
  const compositeFieldGroups: string[][] = [];

  if (isCompositePk) {
    compositeFieldGroups.push(pkFields);
  }
  entity.indexes?.forEach((idx) => {
    if (idx.unique && idx.fields.length > 0) {
      if (idx.fields.length === 1) {
        const singleField = idx.fields[0];
        if (!uniqueSets.has(singleField)) {
          uniqueSets.set(
            singleField,
            new Set(
              existingRows
                .map((r) => r[singleField])
                .filter((v) => v !== undefined && v !== null)
            )
          );
        }
      } else {
        compositeFieldGroups.push(idx.fields);
      }
    }
  });

  existingRows.forEach((r) => {
    compositeFieldGroups.forEach((group, gIdx) => {
      const key = `${gIdx}:${group.map((f) => String(r[f] ?? '')).join('|')}`;
      compositeTuples.add(key);
    });
  });

  for (let i = 0; i < count; i++) {
    let row: Record<string, any> = {};
    let compositeValid = true;
    let rowAttempt = 0;
    const allAvailableRows = [...existingRows, ...newRows];

    while (rowAttempt < 25) {
      row = {};
      compositeValid = true;

      // Pass A: Non-FK Primary Keys
      for (const field of entity.fields) {
        const isFk = childFkFields.has(field.name);
        if (!isFk && isFieldPk(field)) {
          row[field.name] = generateUniqueFieldValue(
            ir,
            activeRelations,
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
          activeRelations,
          entity,
          field,
          allAvailableRows,
          row,
          uniqueSets.get(field.name),
          oneToOneFkFields.has(field.name)
        );
      }

      // Pass C: Atomic Composite FK Assignment (copy all columns of a composite FK from the SAME parent row)
      for (const group of compositeGroups) {
        const parentEnt = ir.entities.find((e) => e.name === group.parentEntity);
        if (parentEnt?.seedData && parentEnt.seedData.length > 0) {
          const chosenParentRow = faker.helpers.arrayElement(parentEnt.seedData);
          for (const mapping of group.mappings) {
            row[mapping.childFkField] = chosenParentRow[mapping.parentPkField];
          }
        }
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
          const tupleKey = `${gIdx}:${group.map((f) => String(row[f] ?? '')).join('|')}`;
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
      const tupleKey = `${gIdx}:${group.map((f) => String(row[f] ?? '')).join('|')}`;
      compositeTuples.add(tupleKey);
    });

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
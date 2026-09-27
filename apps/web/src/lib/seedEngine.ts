import { faker } from '@faker-js/faker';
import type { CanonicalIR, Entity, Field, Relation } from '@zero-dollar/ir-core';

export interface SeedResult {
  ir: CanonicalIR;
  message: string;
}

export interface ResolvedRelation {
  rawRelation: Relation;
  parentEntity: string;
  parentPkField: string;
  childEntity: string;
  childFkField: string;
  type: Relation['type'];
  onDelete: NonNullable<Relation['onDelete']>;
}

const STATUS_FALLBACKS = ['pending', 'processing', 'completed', 'cancelled'];
const METHOD_FALLBACKS = ['card', 'ach', 'wire', 'apple_pay'];
const ROLE_FALLBACKS = ['admin', 'member', 'viewer', 'owner'];

export function isFieldPk(field?: Field): boolean {
  if (!field) return false;
  return field.isPrimaryKey !== undefined ? field.isPrimaryKey : field.name === 'id';
}

function singularize(word: string): string {
  const lower = word.toLowerCase();
  if (lower.endsWith('ies')) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith('ses') || lower.endsWith('xes') || lower.endsWith('zes')) {
    return lower.slice(0, -2);
  }
  if (lower.endsWith('s') && !lower.endsWith('ss') && !lower.endsWith('us')) {
    return lower.slice(0, -1);
  }
  return lower;
}

function normalizeStem(str: string): string {
  return singularize(str).replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export class SeedEngine {
  /**
   * Resolves every relation in CanonicalIR into a deterministic
   * (parentEntity, parentPkField) -> (childEntity, childFkField) mapping.
   * Never hijacks unrelated columns like `projectId`.
   */
  public static resolveAllRelations(ir: CanonicalIR): ResolvedRelation[] {
    const resolved: ResolvedRelation[] = [];

    const getPkField = (ent: Entity): string => {
      return ent.fields.find((f) => isFieldPk(f))?.name || ent.fields[0]?.name || 'id';
    };

    for (const rel of ir.relations) {
      const srcEnt = ir.entities.find((e) => e.name === rel.sourceEntity);
      const tgtEnt = ir.entities.find((e) => e.name === rel.targetEntity);
      if (!srcEnt || !tgtEnt) continue;

      const srcField = srcEnt.fields.find((f) => f.name === rel.sourceField);
      const tgtField = tgtEnt.fields.find((f) => f.name === rel.targetField);

      // 1. EXPLICIT CANVAS HANDLES: Both fields exist on their respective tables
      if (srcField && tgtField) {
        const srcIsPk = isFieldPk(srcField);
        const tgtIsPk = isFieldPk(tgtField);

        // If user dragged from Child (non-PK) -> Parent (PK), flip so Parent is source of truth
        if (!srcIsPk && tgtIsPk && srcEnt.name !== tgtEnt.name) {
          resolved.push({
            rawRelation: rel,
            parentEntity: tgtEnt.name,
            parentPkField: tgtField.name,
            childEntity: srcEnt.name,
            childFkField: srcField.name,
            type: rel.type,
            onDelete: rel.onDelete || 'RESTRICT',
          });
        } else {
          resolved.push({
            rawRelation: rel,
            parentEntity: srcEnt.name,
            parentPkField: srcField.name,
            childEntity: tgtEnt.name,
            childFkField: tgtField.name,
            type: rel.type,
            onDelete: rel.onDelete || 'RESTRICT',
          });
        }
        continue;
      }

      // 2. FALLBACK ONLY IF AI OMITTED HANDLES: Match strictly by non-PK column name stem (never hijack a PK!)
      if (!rel.sourceField && !rel.targetField) {
        const srcStem = normalizeStem(srcEnt.name);
        const tgtFk = tgtEnt.fields.find(
          (f) => !isFieldPk(f) && normalizeStem(f.name.replace(/(_id|Id)$/, '')) === srcStem
        );

        if (tgtFk) {
          resolved.push({
            rawRelation: rel,
            parentEntity: srcEnt.name,
            parentPkField: getPkField(srcEnt),
            childEntity: tgtEnt.name,
            childFkField: tgtFk.name,
            type: rel.type,
            onDelete: rel.onDelete || 'RESTRICT',
          });
        }
      }
    }

    return resolved;
  }

  /**
   * Seeds `count` rows into `entityName`, automatically seeding any empty parent
   * tables first and repairing any pre-existing orphaned FKs across the graph.
   */
  public static seedEntityWithDependencies(
    ir: CanonicalIR,
    entityName: string,
    count = 5
  ): SeedResult {
    const workingIR: CanonicalIR = JSON.parse(JSON.stringify(ir));
    const resolvedRelations = this.resolveAllRelations(workingIR);

    const autoSeededParents: string[] = [];
    const visiting = new Set<string>();

    const seedRecursive = (targetName: string, neededCount: number) => {
      if (visiting.has(targetName)) return;
      visiting.add(targetName);

      const entity = workingIR.entities.find((e) => e.name === targetName);
      if (!entity) {
        visiting.delete(targetName);
        return;
      }

      const parentDeps = resolvedRelations.filter(
        (r) => r.childEntity === targetName && r.parentEntity !== targetName
      );

      for (const dep of parentDeps) {
        const parentEntity = workingIR.entities.find((e) => e.name === dep.parentEntity);
        if (!parentEntity) continue;

        const existingParentRows = parentEntity.seedData?.length || 0;
        const existingChildRows = entity.seedData?.length || 0;

        if (dep.type === 'ONE_TO_ONE') {
          const requiredParentTotal = existingChildRows + neededCount;
          if (existingParentRows < requiredParentTotal) {
            seedRecursive(parentEntity.name, requiredParentTotal - existingParentRows);
            autoSeededParents.push(parentEntity.name);
          }
        } else if (existingParentRows === 0) {
          seedRecursive(parentEntity.name, Math.max(5, neededCount));
          autoSeededParents.push(parentEntity.name);
        }
      }

      const targetEntity = workingIR.entities.find((e) => e.name === targetName)!;
      const existingRows = targetEntity.seedData || [];
      const generatedRows = this.generateRowsForEntity(
        workingIR,
        resolvedRelations,
        targetEntity,
        existingRows,
        neededCount
      );

      targetEntity.seedData = [...existingRows, ...generatedRows];
      visiting.delete(targetName);
    };

    seedRecursive(entityName, count);
    this.reconcileAllForeignKeys(workingIR, resolvedRelations);

    const targetAfter = workingIR.entities.find((e) => e.name === entityName);
    const beforeCount = ir.entities.find((e) => e.name === entityName)?.seedData?.length || 0;
    const actualAdded = (targetAfter?.seedData?.length || 0) - beforeCount;

    const parentNotice =
      autoSeededParents.length > 0
        ? ` (auto-seeded ${Array.from(new Set(autoSeededParents)).join(', ')})`
        : '';

    return {
      ir: workingIR,
      message: `Seeded ${actualAdded} rows into ${entityName}${parentNotice}`,
    };
  }

  /**
   * Re-binds any orphaned FK values in existing child rows to valid parent PK values.
   */
  public static reconcileAllForeignKeys(
    workingIR: CanonicalIR,
    resolvedRels = this.resolveAllRelations(workingIR)
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

  public static synchronizeSchemaAndData(
    prevIR: CanonicalIR,
    nextIR: CanonicalIR
  ): CanonicalIR {
    const syncedIR: CanonicalIR = JSON.parse(JSON.stringify(nextIR));
    const resolvedRels = this.resolveAllRelations(syncedIR);

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
            val = this.generateFieldValue(
              syncedIR,
              resolvedRels,
              nextEnt,
              field,
              nextEnt.seedData!.slice(0, rowIdx),
              updatedRow
            );
          } else {
            val = this.coerceCellValue(field, val);
          }
          updatedRow[field.name] = val;
        }

        return updatedRow;
      });
    }

    this.reconcileAllForeignKeys(syncedIR, resolvedRels);
    return syncedIR;
  }

  public static updateCellWithIntegrity(
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
    const coercedValue = this.coerceCellValue(fieldDef, rawValue);
    const oldValue = entity.seedData[rowIndex][fieldName];

    if (coercedValue === oldValue) return workingIR;

    const candidateRow = { ...entity.seedData[rowIndex], [fieldName]: coercedValue };

    if (coercedValue !== '') {
      this.validateRowConstraints(workingIR, entityName, candidateRow, rowIndex);
    }

    entity.seedData[rowIndex] = candidateRow;

    if (oldValue !== undefined && oldValue !== '' && coercedValue !== '') {
      const outgoingRels = this.resolveAllRelations(workingIR).filter(
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

  public static validateRowConstraints(
    ir: CanonicalIR,
    entityName: string,
    candidateRow: Record<string, any>,
    excludeRowIndex = -1
  ): void {
    const entity = ir.entities.find((e) => e.name === entityName);
    if (!entity) return;

    const existingRows = (entity.seedData || []).filter((_, idx) => idx !== excludeRowIndex);
    const resolvedRels = this.resolveAllRelations(ir);
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

      // Do not enforce single-column PK uniqueness on a demoted 1:N FK column
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

  public static validateForeignKeys(
    ir: CanonicalIR,
    entityName: string,
    payload: Record<string, any>
  ): void {
    this.validateRowConstraints(ir, entityName, payload, -1);
  }

  public static createBlankRow(
    entity: Entity,
    initialData?: Record<string, any>,
    ir?: CanonicalIR
  ): Record<string, any> {
    const resolvedRels = ir ? this.resolveAllRelations(ir) : [];
    const newRow: Record<string, any> = {};

    for (const field of entity.fields) {
      if (initialData && initialData[field.name] !== undefined) {
        newRow[field.name] = initialData[field.name];
        continue;
      }

      const fkRel = resolvedRels.find(
        (r) => r.childEntity === entity.name && r.childFkField === field.name
      );
      const parentEnt = fkRel
        ? ir?.entities.find((e) => e.name === fkRel.parentEntity)
        : undefined;

      if (fkRel && parentEnt?.seedData && parentEnt.seedData.length > 0) {
        const sampleParent = faker.helpers.arrayElement(parentEnt.seedData);
        newRow[field.name] = sampleParent[fkRel.parentPkField] ?? sampleParent.id ?? '';
      } else if (!fkRel && isFieldPk(field)) {
        newRow[field.name] = field.type === 'number' ? Date.now() : faker.string.uuid();
      } else if (field.defaultValue !== undefined && field.defaultValue !== null) {
        newRow[field.name] = this.evaluateDefaultValue(field);
      } else {
        newRow[field.name] = '';
      }
    }
    if (newRow.id === undefined) {
      newRow.id = initialData?.id || faker.string.uuid();
    }
    return newRow;
  }

  public static coerceCellValue(field: Field | undefined, rawValue: any): any {
    if (!field) return rawValue;
    if (rawValue === '' && field.nullable) return null;
    if (field.type === 'number' && rawValue !== '' && !Number.isNaN(Number(rawValue))) {
      return Number(rawValue);
    }
    if (field.type === 'boolean') {
      return rawValue === 'true' || rawValue === true;
    }
    return rawValue;
  }

  public static deleteRowWithIntegrity(
    ir: CanonicalIR,
    entityName: string,
    rowIndex: number
  ): SeedResult {
    const workingIR: CanonicalIR = JSON.parse(JSON.stringify(ir));
    const entity = workingIR.entities.find((e) => e.name === entityName);
    if (!entity || !entity.seedData || !entity.seedData[rowIndex]) {
      return { ir: workingIR, message: 'Row not found' };
    }

    const resolvedRels = this.resolveAllRelations(workingIR);
    const targetRow = entity.seedData[rowIndex];
    entity.seedData.splice(rowIndex, 1);

    const cascaded = this.applyReferentialDeleteActions(
      workingIR,
      resolvedRels,
      entityName,
      [targetRow]
    );

    const suffix = cascaded > 0 ? ` (cascaded ${cascaded} dependent row(s))` : '';
    return { ir: workingIR, message: `Row removed${suffix}` };
  }

  public static clearTableWithIntegrity(ir: CanonicalIR, entityName: string): SeedResult {
    const workingIR: CanonicalIR = JSON.parse(JSON.stringify(ir));
    const entity = workingIR.entities.find((e) => e.name === entityName);
    if (!entity || !entity.seedData?.length) {
      return { ir: workingIR, message: `Cleared data for ${entityName}` };
    }

    const resolvedRels = this.resolveAllRelations(workingIR);
    const deletingRows = [...entity.seedData];
    entity.seedData = [];

    const cascaded = this.applyReferentialDeleteActions(
      workingIR,
      resolvedRels,
      entityName,
      deletingRows
    );

    const suffix = cascaded > 0 ? ` (cascaded ${cascaded} dependent row(s))` : '';
    return { ir: workingIR, message: `Cleared data for ${entityName}${suffix}` };
  }

  private static applyReferentialDeleteActions(
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
        totalCascaded += this.applyReferentialDeleteActions(
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
        const fallbackVal = fkFieldDef ? this.evaluateDefaultValue(fkFieldDef) : null;
        childEntity.seedData = childEntity.seedData.map((r) =>
          deletingKeySet.has(String(r[rel.childFkField]))
            ? { ...r, [rel.childFkField]: fallbackVal }
            : r
        );
      }
    }

    return totalCascaded;
  }

  private static generateRowsForEntity(
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
      // Note: if an 'id' column was demoted to a 1:N FK, do not enforce its leftover unique flag
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

        // Pass A: True Primary Keys (excluding any column that is a Foreign Key!)
        for (const field of entity.fields) {
          const isFk = childFkFields.has(field.name);
          if (!isFk && isFieldPk(field)) {
            row[field.name] = this.generateUniqueFieldValue(
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
          row[field.name] = this.generateUniqueFieldValue(
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

  private static generateUniqueFieldValue(
    ir: CanonicalIR,
    resolvedRelations: ResolvedRelation[],
    entity: Entity,
    field: Field,
    allAvailableRows: Record<string, any>[],
    partialRow: Record<string, any>,
    uSet: Set<any> | undefined,
    isOneToOneFk: boolean
  ): any {
    let val = this.generateFieldValue(
      ir,
      resolvedRelations,
      entity,
      field,
      allAvailableRows,
      partialRow
    );

    if (!uSet || val === null) return val;

    let retries = 0;
    while (uSet.has(val) && retries < 15) {
      val = this.generateFieldValue(
        ir,
        resolvedRelations,
        entity,
        field,
        allAvailableRows,
        partialRow
      );
      retries++;
    }

    const isFk = resolvedRelations.some(
      (r) => r.childEntity === entity.name && r.childFkField === field.name
    );

    if (uSet.has(val) && !isOneToOneFk && !isFk) {
      if (field.type === 'string') {
        const suffix = faker.string.alphanumeric(4).toLowerCase();
        val = String(val).includes('@')
          ? String(val).replace('@', `+${suffix}@`)
          : `${val}_${suffix}`;
      } else if (field.type === 'number') {
        val = Number(val) + uSet.size + 1;
      } else if (field.type === 'uuid') {
        val = faker.string.uuid();
      }
    }

    return val;
  }

  private static evaluateDefaultValue(field: Field): any {
    const raw = field.defaultValue;
    if (raw === undefined || raw === null) return null;
    const str = String(raw).trim().toLowerCase();
    if (str === 'now()' || str === 'current_timestamp') return new Date().toISOString();
    if (str === 'uuid()' || str === 'gen_random_uuid()') return faker.string.uuid();
    if (field.type === 'number' && !Number.isNaN(Number(raw))) return Number(raw);
    if (field.type === 'boolean') return str === 'true';
    return String(raw).replace(/^['"]|['"]$/g, '');
  }

  private static generateFieldValue(
    ir: CanonicalIR,
    resolvedRelations: ResolvedRelation[],
    entity: Entity,
    field: Field,
    currentEntityRows: Record<string, any>[],
    partialRow: Record<string, any>
  ): any {
    // 1. Foreign Key Resolution ALWAYS takes priority over PK!
    const incomingRel = resolvedRelations.find(
      (r) => r.childEntity === entity.name && r.childFkField === field.name
    );

    if (incomingRel) {
      const refField = incomingRel.parentPkField || 'id';

      if (incomingRel.parentEntity === entity.name) {
        if (currentEntityRows.length === 0) {
          return field.nullable ? null : partialRow[refField] ?? faker.string.uuid();
        }
        const parentRow = faker.helpers.arrayElement(currentEntityRows);
        return parentRow[refField] ?? parentRow.id;
      }

      const parentEntity = ir.entities.find((e) => e.name === incomingRel.parentEntity);
      const parentRows = parentEntity?.seedData || [];

      if (parentRows.length > 0) {
        if (incomingRel.type === 'ONE_TO_ONE') {
          const usedValues = new Set(currentEntityRows.map((r) => r[field.name]));
          const availableParents = parentRows.filter(
            (p) => !usedValues.has(p[refField] ?? p.id)
          );
          if (availableParents.length > 0) {
            const chosen = faker.helpers.arrayElement(availableParents);
            return chosen[refField] ?? chosen.id;
          }
        }
        const chosenParent = faker.helpers.arrayElement(parentRows);
        return chosenParent[refField] ?? chosenParent.id;
      }
    }

    const isPk = isFieldPk(field);

    // 2. Occasional null for nullable non-PK, non-FK fields (~12% probability)
    if (!isPk && field.nullable && Math.random() < 0.12) {
      return null;
    }

    // 3. Explicit SQL / Column Default Value
    if (
      !isPk &&
      field.defaultValue !== undefined &&
      field.defaultValue !== null &&
      field.defaultValue !== ''
    ) {
      return this.evaluateDefaultValue(field);
    }

    // 4. Custom Enums in CanonicalIR
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normField = normalize(field.name);
    const matchingEnum = ir.enums.find((en) => {
      const normEnum = normalize(en.name);
      return normEnum === normField || normField.endsWith(normEnum);
    });
    if (matchingEnum && matchingEnum.values.length > 0) {
      return faker.helpers.arrayElement(matchingEnum.values);
    }

    // 5. Context-Aware Faker Mapping
    const tableLower = entity.name.toLowerCase();
    const fieldLower = field.name.toLowerCase();

    if (field.type === 'uuid' || isPk) {
      return faker.string.uuid();
    }

    if (field.type === 'boolean') {
      return faker.datatype.boolean({ probability: 0.75 });
    }

    if (field.type === 'datetime') {
      return faker.date.recent({ days: 30 }).toISOString();
    }

    if (field.type === 'json') {
      return JSON.stringify({
        source: faker.internet.domainWord(),
        verified: true,
      });
    }

    if (field.type === 'number') {
      if (
        fieldLower.includes('inventory') ||
        fieldLower.includes('stock') ||
        fieldLower.includes('qty') ||
        fieldLower.includes('quantity') ||
        fieldLower.includes('count')
      ) {
        return faker.number.int({ min: 1, max: 250 });
      }
      if (fieldLower.includes('rating') || fieldLower.includes('stars')) {
        return faker.number.int({ min: 1, max: 5 });
      }
      if (fieldLower.includes('age')) {
        return faker.number.int({ min: 18, max: 65 });
      }
      return Number(faker.commerce.price({ min: 5, max: 500, dec: 2 }));
    }

    if (fieldLower.includes('email')) {
      return faker.internet.email().toLowerCase();
    }
    if (
      fieldLower.includes('token') ||
      fieldLower.includes('hash') ||
      fieldLower.includes('secret')
    ) {
      return `tok_${faker.string.alphanumeric(20)}`;
    }
    if (fieldLower.includes('status') || fieldLower.includes('state')) {
      return faker.helpers.arrayElement(STATUS_FALLBACKS);
    }
    if (fieldLower.includes('method') || fieldLower.includes('provider')) {
      return faker.helpers.arrayElement(METHOD_FALLBACKS);
    }
    if (fieldLower.includes('role')) {
      return faker.helpers.arrayElement(ROLE_FALLBACKS);
    }
    if (fieldLower.includes('slug')) {
      return faker.helpers.slugify(faker.commerce.productName()).toLowerCase();
    }
    if (
      fieldLower.includes('url') ||
      fieldLower.includes('avatar') ||
      fieldLower.includes('image')
    ) {
      return faker.image.url();
    }
    if (fieldLower.includes('phone')) {
      return faker.phone.number();
    }
    if (
      fieldLower.includes('description') ||
      fieldLower.includes('bio') ||
      fieldLower.includes('text')
    ) {
      return faker.commerce.productDescription().slice(0, 72);
    }

    if (fieldLower.includes('name') || fieldLower.includes('title')) {
      if (
        tableLower.includes('product') ||
        tableLower.includes('item') ||
        tableLower.includes('catalog')
      ) {
        return faker.commerce.productName();
      }
      if (
        tableLower.includes('store') ||
        tableLower.includes('company') ||
        tableLower.includes('org') ||
        tableLower.includes('vendor')
      ) {
        return faker.company.name();
      }
      if (tableLower.includes('tag') || tableLower.includes('category')) {
        return faker.commerce.department();
      }
      if (tableLower.includes('task') || tableLower.includes('ticket')) {
        return faker.hacker.phrase().slice(0, 40);
      }
      return faker.person.fullName();
    }

    return faker.commerce.productMaterial();
  }
}
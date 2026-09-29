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
  isCompositeParent: boolean;
  isCompleteComposite: boolean;
  missingParentPkFields: string[];
}

export interface CompositeRelationGroup {
  parentEntity: string;
  childEntity: string;
  type: Relation['type'];
  onDelete: NonNullable<Relation['onDelete']>;
  isComplete: boolean;
  missingParentPkFields: string[];
  mappings: Array<{
    parentPkField: string;
    childFkField: string;
  }>;
}

export function isFieldPk(field?: Field): boolean {
  if (!field) return false;
  return field.isPrimaryKey !== undefined ? field.isPrimaryKey : field.name === 'id';
}

/**
 * Returns all Primary Key field names for an entity (supports both single PK and Composite PK).
 */
export function getEntityPkFields(entity: Entity): string[] {
  const fieldNames = new Set(entity.fields.map((f) => f.name));
  const pkSet = new Set<string>();

  entity.fields.forEach((f) => {
    if (isFieldPk(f)) pkSet.add(f.name);
  });

  if (pkSet.size === 0 && entity.primaryKey && entity.primaryKey.length > 0) {
    entity.primaryKey.forEach((pk) => {
      if (fieldNames.has(pk)) pkSet.add(pk);
    });
  }

  if (pkSet.size === 0 && entity.fields[0]) {
    pkSet.add(entity.fields[0].name);
  }

  return Array.from(pkSet);
}

/**
 * Returns a deterministic string key for a row (joins composite PK values with "::").
 */
export function getRowCompositeKey(entity: Entity, row: Record<string, any>): string {
  const pkFields = getEntityPkFields(entity);
  if (pkFields.length === 0) return String(row.id ?? '');
  return pkFields.map((k) => String(row[k] ?? '')).join('::');
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

export function normalizeStem(str: string): string {
  return singularize(str).replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/**
 * Finds a matching Foreign Key column on `childEnt` for a given `parentPkField` on `parentEnt`.
 */
export function findMatchingChildFkField(
  parentEnt: Entity,
  parentPkField: string,
  childEnt: Entity
): Field | undefined {
  const parentStem = normalizeStem(parentEnt.name);
  const pkLower = parentPkField.toLowerCase();

  return childEnt.fields.find((f) => {
    const fLower = f.name.toLowerCase();
    // 1. Exact match (e.g. parent `sku` -> child `sku` or `product_id` -> `product_id`)
    if (pkLower !== 'id' && fLower === pkLower) return true;
    // 2. Prefixed match (e.g. `product_id`, `product_sku`)
    if (fLower === `${parentStem}_${pkLower}` || fLower === `${parentStem}${pkLower}`) {
      return true;
    }
    // 3. Stem match for `id` (e.g. parent `Product.id` -> child `product_id`)
    if (
      pkLower === 'id' &&
      !isFieldPk(f) &&
      normalizeStem(f.name.replace(/(_id|Id)$/, '')) === parentStem
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Resolves every relation in CanonicalIR into a deterministic mapping,
 * including AI-generated relations that omit sourceField/targetField.
 */
export function resolveAllRelations(ir: CanonicalIR): ResolvedRelation[] {
  const prelim: Array<
    Omit<
      ResolvedRelation,
      'isCompositeParent' | 'isCompleteComposite' | 'missingParentPkFields'
    >
  > = [];

  for (const rel of ir.relations) {
    const srcEnt = ir.entities.find((e) => e.name === rel.sourceEntity);
    const tgtEnt = ir.entities.find((e) => e.name === rel.targetEntity);
    if (!srcEnt || !tgtEnt) continue;

    const srcField = srcEnt.fields.find((f) => f.name === rel.sourceField);
    const tgtField = tgtEnt.fields.find((f) => f.name === rel.targetField);

    // Case 1: Both sourceField and targetField are explicitly defined
    if (srcField && tgtField) {
      const srcIsPk = isFieldPk(srcField);
      const tgtIsPk = isFieldPk(tgtField);

      if (!srcIsPk && tgtIsPk && srcEnt.name !== tgtEnt.name) {
        prelim.push({
          rawRelation: rel,
          parentEntity: tgtEnt.name,
          parentPkField: tgtField.name,
          childEntity: srcEnt.name,
          childFkField: srcField.name,
          type: rel.type,
          onDelete: rel.onDelete || 'RESTRICT',
        });
      } else {
        prelim.push({
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

    // Case 2: AI-generated relation where sourceField / targetField were omitted
    const srcPkFields = getEntityPkFields(srcEnt);
    let matchedAny = false;

    for (const pkField of srcPkFields) {
      const matchedChildFk = findMatchingChildFkField(srcEnt, pkField, tgtEnt);
      if (matchedChildFk) {
        matchedAny = true;
        prelim.push({
          rawRelation: rel,
          parentEntity: srcEnt.name,
          parentPkField: pkField,
          childEntity: tgtEnt.name,
          childFkField: matchedChildFk.name,
          type: rel.type,
          onDelete: rel.onDelete || 'RESTRICT',
        });
      }
    }

    // Fallback if AI named the FK column something non-standard
    if (!matchedAny && srcPkFields[0]) {
      const fallbackChildFk =
        tgtEnt.fields.find((f) => !isFieldPk(f)) || tgtEnt.fields[0];
      if (fallbackChildFk) {
        prelim.push({
          rawRelation: rel,
          parentEntity: srcEnt.name,
          parentPkField: srcPkFields[0],
          childEntity: tgtEnt.name,
          childFkField: fallbackChildFk.name,
          type: rel.type,
          onDelete: rel.onDelete || 'RESTRICT',
        });
      }
    }
  }

  // Evaluate Composite Primary Key completeness per (parentEntity -> childEntity) pair
  return prelim.map((item) => {
    const parentEnt = ir.entities.find((e) => e.name === item.parentEntity);
    if (!parentEnt) {
      return {
        ...item,
        isCompositeParent: false,
        isCompleteComposite: true,
        missingParentPkFields: [],
      };
    }

    const parentPkFields = getEntityPkFields(parentEnt);
    const isCompositeParent = parentPkFields.length > 1;

    if (!isCompositeParent) {
      return {
        ...item,
        isCompositeParent: false,
        isCompleteComposite: true,
        missingParentPkFields: [],
      };
    }

    const referencedParentField = parentEnt.fields.find(
      (f) => f.name === item.parentPkField
    );
    const isMemberOfCompositePk = parentPkFields.includes(item.parentPkField);

    // SQL RULE ENFORCEMENT: A single-column FK to a table with a composite PK is ONLY valid if:
    // 1) It references a non-PK column that is explicitly marked @unique, OR
    // 2) The user explicitly created a single-column @@unique([col]) index on that parent column.
    const hasExplicitSingleUniqueIndex = (parentEnt.indexes || []).some(
      (idx) =>
        idx.unique &&
        idx.fields.length === 1 &&
        idx.fields[0] === item.parentPkField
    );

    if (
      (!isMemberOfCompositePk && referencedParentField?.unique) ||
      hasExplicitSingleUniqueIndex
    ) {
      // It's a valid unique reference, so it's technically a "complete" single-column FK
      return {
        ...item,
        isCompositeParent: false,
        isCompleteComposite: true,
        missingParentPkFields: [],
      };
    }

    // Otherwise, ALL composite PK fields of parentEnt must be wired to childEnt
    const wiredParentFields = new Set(
      prelim
        .filter(
          (r) =>
            r.parentEntity === item.parentEntity &&
            r.childEntity === item.childEntity
        )
        .map((r) => r.parentPkField)
    );

    const missingParentPkFields = parentPkFields.filter(
      (pk) => !wiredParentFields.has(pk)
    );

    return {
      ...item,
      isCompositeParent: true,
      isCompleteComposite: missingParentPkFields.length === 0,
      missingParentPkFields,
    };
  });
}

/**
 * Groups relations between the same (parentEntity, childEntity) so Composite Foreign Keys
 * can be seeded, reconciled, and validated atomically from the same parent row.
 */
export function resolveCompositeGroups(
  ir: CanonicalIR,
  resolvedRels = resolveAllRelations(ir)
): CompositeRelationGroup[] {
  const map = new Map<string, CompositeRelationGroup>();

  for (const rel of resolvedRels) {
    const key = `${rel.parentEntity}:::${rel.childEntity}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        parentEntity: rel.parentEntity,
        childEntity: rel.childEntity,
        type: rel.type,
        onDelete: rel.onDelete,
        isComplete: rel.isCompleteComposite,
        missingParentPkFields: rel.missingParentPkFields,
        mappings: [
          {
            parentPkField: rel.parentPkField,
            childFkField: rel.childFkField,
          },
        ],
      });
    } else {
      if (
        !existing.mappings.some(
          (m) =>
            m.parentPkField === rel.parentPkField &&
            m.childFkField === rel.childFkField
        )
      ) {
        existing.mappings.push({
          parentPkField: rel.parentPkField,
          childFkField: rel.childFkField,
        });
      }
      existing.isComplete = existing.isComplete && rel.isCompleteComposite;
    }
  }

  return Array.from(map.values());
}

/**
 * Returns any incomplete composite FK groups for visual warnings on the canvas.
 */
export function getIncompleteCompositeRelations(
  ir: CanonicalIR
): CompositeRelationGroup[] {
  return resolveCompositeGroups(ir).filter((g) => !g.isComplete);
}
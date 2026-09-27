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

export function normalizeStem(str: string): string {
  return singularize(str).replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/**
 * Resolves every relation in CanonicalIR into a deterministic
 * (parentEntity, parentPkField) -> (childEntity, childFkField) mapping.
 */
export function resolveAllRelations(ir: CanonicalIR): ResolvedRelation[] {
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

    // 1. Explicit canvas handles: both fields exist on their respective tables
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

    // 2. Fallback only if AI omitted handles: match strictly by non-PK column name stem
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
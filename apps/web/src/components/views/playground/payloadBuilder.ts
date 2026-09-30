import type { CanonicalIR, Entity, Field } from '@zero-dollar/ir-core';
import { SeedEngine, isFieldPk, ResolvedRelation } from '../../../lib/seedEngine';
import { EndpointMethod, KeyValueField } from './playgroundTypes';

export function buildSamplePayloadForEntity(
  present: CanonicalIR,
  targetEntity: Entity,
  resolvedRelations: ResolvedRelation[],
  methodType: EndpointMethod,
  targetRow?: Record<string, any>
): { kvFields: KeyValueField[]; jsonText: string } {
  const rows = targetEntity.seedData || [];
  const rowToUse = methodType === 'PUT' ? targetRow || rows[0] : rows[0];

  const incomingRels = resolvedRelations.filter((r) => r.childEntity === targetEntity.name);
  const fkFieldSet = new Set(incomingRels.map((r) => r.childFkField));
  const pkFields = SeedEngine.getEntityPkFields(targetEntity);
  const isCompositePk = pkFields.length > 1;

  const kvFields: KeyValueField[] = [];
  const sampleObj: Record<string, any> = {};

  targetEntity.fields.forEach((f) => {
    const isFk = fkFieldSet.has(f.name);
    const isSingleAutoPk = !isCompositePk && !isFk && isFieldPk(f);
    if (isSingleAutoPk) return;

    const fkRel = incomingRels.find((r) => r.childFkField === f.name);
    let val: any = '';
    let fkInfo: KeyValueField['fkInfo'] | undefined;

    if (fkRel) {
      const parentEnt = present.entities.find((e) => e.name === fkRel.parentEntity);
      const parentOptions = (parentEnt?.seedData || [])
        .map((r) => String(r[fkRel.parentPkField] ?? r.id))
        .filter(Boolean);
      fkInfo = {
        parentEntity: fkRel.parentEntity,
        parentPkField: fkRel.parentPkField,
        options: parentOptions,
      };
    }

    if (methodType === 'PUT' && rowToUse && rowToUse[f.name] !== undefined) {
      val = rowToUse[f.name];
    } else if (fkInfo) {
      val = fkInfo.options[0] || rowToUse?.[f.name] || crypto.randomUUID();
    } else if (f.type === 'uuid') {
      val = crypto.randomUUID();
    } else if (f.type === 'number') {
      val = 100;
    } else if (f.type === 'boolean') {
      val = true;
    } else if (f.type === 'datetime') {
      val = new Date().toISOString();
    } else if (f.name === 'status') {
      val = 'pending';
    } else {
      val = `new_${f.name}`;
    }

    sampleObj[f.name] = val;
    kvFields.push({
      id: `kv_${f.name}`,
      enabled: true,
      key: f.name,
      value: val === null || val === undefined ? '' : String(val),
      type: f.type,
      fkInfo,
    });
  });

  return { kvFields, jsonText: JSON.stringify(sampleObj, null, 2) };
}

export function serializeKvToJson(kvFields: KeyValueField[], targetEntity?: Entity): string {
  const obj: Record<string, any> = {};
  kvFields.forEach((item) => {
    if (!item.enabled || !item.key.trim()) return;
    const fieldDef = targetEntity?.fields.find((f) => f.name === item.key.trim());
    obj[item.key.trim()] = SeedEngine.coerceCellValue(
      fieldDef || ({ name: item.key, type: item.type, nullable: false, unique: false } as Field),
      item.value
    );
  });
  return JSON.stringify(obj, null, 2);
}

export function parseJsonToKv(
  rawJson: string,
  present: CanonicalIR,
  targetEntity: Entity | undefined,
  resolvedRelations: ResolvedRelation[]
): KeyValueField[] | null {
  const parsed = JSON.parse(rawJson || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const incomingRels = resolvedRelations.filter((r) => r.childEntity === targetEntity?.name);

  return Object.entries(parsed).map(([k, v], idx) => {
    const fieldDef = targetEntity?.fields.find((f) => f.name === k);
    const fkRel = incomingRels.find((r) => r.childFkField === k);
    let fkInfo: KeyValueField['fkInfo'] | undefined;
    
    if (fkRel) {
      const parentEnt = present.entities.find((e) => e.name === fkRel.parentEntity);
      fkInfo = {
        parentEntity: fkRel.parentEntity,
        parentPkField: fkRel.parentPkField,
        options: (parentEnt?.seedData || []).map((r) => String(r[fkRel.parentPkField] ?? r.id)).filter(Boolean),
      };
    }
    
    return {
      id: `kv_${k}_${idx}`,
      enabled: true,
      key: k,
      value: v === null ? '' : String(v),
      type: fieldDef?.type || (typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string'),
      fkInfo,
    };
  });
}
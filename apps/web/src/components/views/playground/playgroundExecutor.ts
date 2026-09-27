import type { CanonicalIR, Entity, Field } from '@zero-dollar/ir-core';
import { SeedEngine, isFieldPk, ResolvedRelation } from '../../../lib/seedEngine';
import {
  EndpointMethod,
  KeyValueField,
  PlaygroundResponseState,
  QueryParamRow,
  formatByteSize,
} from './playgroundTypes';

export function buildSamplePayloadForEntity(
  present: CanonicalIR,
  targetEntity: Entity,
  resolvedRelations: ResolvedRelation[],
  methodType: EndpointMethod
): { kvFields: KeyValueField[]; jsonText: string } {
  const rows = targetEntity.seedData || [];
  const sampleRow = rows[0];

  const incomingRels = resolvedRelations.filter((r) => r.childEntity === targetEntity.name);
  const fkFieldSet = new Set(incomingRels.map((r) => r.childFkField));

  const kvFields: KeyValueField[] = [];
  const sampleObj: Record<string, any> = {};

  targetEntity.fields.forEach((f) => {
    const isFk = fkFieldSet.has(f.name);
    const isTruePk = !isFk && isFieldPk(f);
    if (isTruePk) return;

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
      val =
        (methodType === 'PUT' && sampleRow?.[f.name]) ||
        parentOptions[0] ||
        sampleRow?.[f.name] ||
        crypto.randomUUID();
    } else if (sampleRow && sampleRow[f.name] !== undefined && sampleRow[f.name] !== null) {
      val = sampleRow[f.name];
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
      val = `sample_${f.name}`;
    }

    sampleObj[f.name] = val;
    kvFields.push({
      id: `kv_${f.name}`,
      enabled: true,
      key: f.name,
      value: String(val),
      type: f.type,
      fkInfo,
    });
  });

  return {
    kvFields,
    jsonText: JSON.stringify(sampleObj, null, 2),
  };
}

export function serializeKvToJson(
  kvFields: KeyValueField[],
  targetEntity?: Entity
): string {
  const obj: Record<string, any> = {};
  kvFields.forEach((item) => {
    if (!item.enabled || !item.key.trim()) return;
    const fieldDef = targetEntity?.fields.find((f) => f.name === item.key.trim());
    obj[item.key.trim()] = SeedEngine.coerceCellValue(
      fieldDef ||
        ({ name: item.key, type: item.type, nullable: false, unique: false } as Field),
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

  const incomingRels = resolvedRelations.filter(
    (r) => r.childEntity === targetEntity?.name
  );

  return Object.entries(parsed).map(([k, v], idx) => {
    const fieldDef = targetEntity?.fields.find((f) => f.name === k);
    const fkRel = incomingRels.find((r) => r.childFkField === k);
    let fkInfo: KeyValueField['fkInfo'] | undefined;
    if (fkRel) {
      const parentEnt = present.entities.find((e) => e.name === fkRel.parentEntity);
      fkInfo = {
        parentEntity: fkRel.parentEntity,
        parentPkField: fkRel.parentPkField,
        options: (parentEnt?.seedData || [])
          .map((r) => String(r[fkRel.parentPkField] ?? r.id))
          .filter(Boolean),
      };
    }
    return {
      id: `kv_${k}_${idx}`,
      enabled: true,
      key: k,
      value: v === null ? '' : String(v),
      type:
        fieldDef?.type ||
        (typeof v === 'number'
          ? 'number'
          : typeof v === 'boolean'
          ? 'boolean'
          : 'string'),
      fkInfo,
    };
  });
}

function makeResponse(
  status: number,
  statusText: string,
  summaryMessage: string,
  payloadObj: any
): PlaygroundResponseState {
  const body = JSON.stringify(payloadObj, null, 2);
  return {
    status,
    statusText,
    summaryMessage,
    sizeLabel: formatByteSize(body),
    body,
  };
}

export function executePlaygroundRequest(params: {
  present: CanonicalIR;
  targetEntity: Entity;
  methodType: EndpointMethod;
  pkFieldName: string;
  pathIdParam: string;
  queryParams: QueryParamRow[];
  requestBodyText: string;
  addTableRow: (entityName: string, initialData?: Record<string, any>) => Record<string, any> | null;
  setEntitySeedData: (entityName: string, rows: Record<string, any>[]) => void;
  applyAIPatch: (newIR: CanonicalIR) => void;
  showToast: (msg: string) => void;
}): PlaygroundResponseState {
  const {
    present,
    targetEntity,
    methodType,
    pkFieldName,
    pathIdParam,
    queryParams,
    requestBodyText,
    addTableRow,
    setEntitySeedData,
    applyAIPatch,
    showToast,
  } = params;

  const rows = [...(targetEntity.seedData || [])];
  const targetId = pathIdParam.trim();

  // 1. GET LIST
  if (methodType === 'GET_LIST') {
    const activeFilters = queryParams.filter((q) => q.enabled && q.key.trim() !== '');
    const filteredRows = rows.filter((row) =>
      activeFilters.every((q) =>
        String(row[q.key.trim()] ?? '')
          .toLowerCase()
          .includes(q.value.trim().toLowerCase())
      )
    );
    return makeResponse(
      200,
      'OK',
      `Fetched ${filteredRows.length} record(s) from ${targetEntity.name}`,
      { statusCode: 200, status: 'OK', count: filteredRows.length, data: filteredRows }
    );
  }

  // 2. GET BY ID
  if (methodType === 'GET_ID') {
    const found = rows.find((r) => String(r[pkFieldName] ?? r.id) === targetId);
    if (!found) {
      return makeResponse(
        404,
        'Not Found',
        `No record in ${targetEntity.name} matches ${pkFieldName} = "${targetId}"`,
        {
          statusCode: 404,
          status: 'Not Found',
          error: `Record with ${pkFieldName} "${targetId}" was not found in ${targetEntity.name}.`,
        }
      );
    }
    return makeResponse(
      200,
      'OK',
      `Fetched record "${targetId}" from ${targetEntity.name}`,
      { statusCode: 200, status: 'OK', data: found }
    );
  }

  // 3. POST
  if (methodType === 'POST') {
    try {
      const parsed = JSON.parse(requestBodyText || '{}');
      const candidate = SeedEngine.createBlankRow(targetEntity, parsed, present);
      SeedEngine.validateRowConstraints(present, targetEntity.name, candidate, -1);
      const created = addTableRow(targetEntity.name, candidate);
      showToast(`201 Created — row added to ${targetEntity.name}`);
      return makeResponse(
        201,
        'Created',
        `Successfully created a new record in ${targetEntity.name}`,
        {
          statusCode: 201,
          status: 'Created',
          message: `Record created in "${targetEntity.name}"`,
          data: created,
        }
      );
    } catch (err: any) {
      const isConstraint =
        err.message?.includes('violation') || err.message?.includes('cardinality');
      return makeResponse(
        isConstraint ? 409 : 400,
        isConstraint ? 'Conflict' : 'Bad Request',
        err.message,
        {
          statusCode: isConstraint ? 409 : 400,
          status: isConstraint ? 'Conflict' : 'Bad Request',
          error: isConstraint ? 'Database Constraint Violation' : 'Invalid Request Payload',
          details: err.message,
        }
      );
    }
  }

  // 4. PUT
  if (methodType === 'PUT') {
    try {
      const parsed = JSON.parse(requestBodyText || '{}');
      const idx = rows.findIndex((r) => String(r[pkFieldName] ?? r.id) === targetId);
      if (idx === -1) {
        return makeResponse(
          404,
          'Not Found',
          `Cannot update: no record in ${targetEntity.name} has ${pkFieldName} = "${targetId}"`,
          {
            statusCode: 404,
            status: 'Not Found',
            error: `Record with ${pkFieldName} "${targetId}" does not exist in "${targetEntity.name}".`,
          }
        );
      }

      const updated: Record<string, any> = { ...rows[idx] };
      Object.entries(parsed).forEach(([k, v]) => {
        const fDef = targetEntity.fields.find((f) => f.name === k);
        updated[k] = SeedEngine.coerceCellValue(fDef, v);
      });

      SeedEngine.validateRowConstraints(present, targetEntity.name, updated, idx);
      rows[idx] = updated;
      setEntitySeedData(targetEntity.name, rows);
      showToast(`200 OK — updated record in ${targetEntity.name}`);

      return makeResponse(
        200,
        'OK',
        `Successfully updated record "${targetId}" in ${targetEntity.name}`,
        {
          statusCode: 200,
          status: 'OK',
          message: `Record "${targetId}" in "${targetEntity.name}" updated successfully`,
          data: updated,
        }
      );
    } catch (err: any) {
      const isConstraint =
        err.message?.includes('violation') || err.message?.includes('cardinality');
      return makeResponse(
        isConstraint ? 409 : 400,
        isConstraint ? 'Conflict' : 'Bad Request',
        err.message,
        {
          statusCode: isConstraint ? 409 : 400,
          status: isConstraint ? 'Conflict' : 'Bad Request',
          error: isConstraint ? 'Database Constraint Violation' : 'Invalid Request Payload',
          details: err.message,
        }
      );
    }
  }

  // 5. DELETE
  const idx = rows.findIndex((r) => String(r[pkFieldName] ?? r.id) === targetId);
  if (idx === -1) {
    return makeResponse(
      404,
      'Not Found',
      `Cannot delete: no record in ${targetEntity.name} has ${pkFieldName} = "${targetId}"`,
      {
        statusCode: 404,
        status: 'Not Found',
        error: `Record with ${pkFieldName} "${targetId}" was not found in "${targetEntity.name}".`,
      }
    );
  }

  const deletedSnapshot = rows[idx];
  try {
    const result = SeedEngine.deleteRowWithIntegrity(present, targetEntity.name, idx);
    applyAIPatch(result.ir);
    showToast(`200 OK — ${result.message}`);

    return makeResponse(
      200,
      'OK',
      `Successfully deleted record "${targetId}" from ${targetEntity.name}`,
      {
        statusCode: 200,
        status: 'OK',
        message: result.message,
        deletedId: targetId,
        deletedRecord: deletedSnapshot,
      }
    );
  } catch (err: any) {
    return makeResponse(409, 'Conflict', err.message, {
      statusCode: 409,
      status: 'Conflict',
      error: 'Referential Integrity Constraint Violation',
      details: err.message,
    });
  }
}
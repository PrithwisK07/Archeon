import type { CanonicalIR, Entity } from '@zero-dollar/ir-core';
import { SeedEngine } from '../../../lib/seedEngine';
import {
  EndpointMethod,
  PlaygroundResponseState,
  QueryParamRow,
  formatByteSize,
} from './playgroundTypes';

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
    present, targetEntity, methodType, pkFieldName, pathIdParam,
    queryParams, requestBodyText, addTableRow, setEntitySeedData, applyAIPatch, showToast,
  } = params;

  const rows = [...(targetEntity.seedData || [])];
  const targetId = pathIdParam.trim();

  if (methodType === 'GET_LIST') {
    const activeFilters = queryParams.filter((q) => q.enabled && q.key.trim() !== '');
    const filteredRows = rows.filter((row) =>
      activeFilters.every((q) =>
        String(row[q.key.trim()] ?? '').toLowerCase().includes(q.value.trim().toLowerCase())
      )
    );
    return makeResponse(200, 'OK', `Fetched ${filteredRows.length} record(s) from ${targetEntity.name}`, {
      statusCode: 200, status: 'OK', count: filteredRows.length, data: filteredRows,
    });
  }

  if (methodType === 'GET_ID') {
    const found = rows.find((r) => SeedEngine.getRowCompositeKey(targetEntity, r) === targetId);
    if (!found) {
      return makeResponse(404, 'Not Found', `No record in ${targetEntity.name} matches ${pkFieldName} = "${targetId}"`, {
        statusCode: 404, status: 'Not Found', error: `Record with ${pkFieldName} "${targetId}" was not found.`,
      });
    }
    return makeResponse(200, 'OK', `Fetched record "${targetId}" from ${targetEntity.name}`, {
      statusCode: 200, status: 'OK', data: found,
    });
  }

  if (methodType === 'POST') {
    try {
      const parsed = JSON.parse(requestBodyText || '{}');
      const candidate = SeedEngine.createBlankRow(targetEntity, parsed, present);
      SeedEngine.validateRowConstraints(present, targetEntity.name, candidate, -1);
      const created = addTableRow(targetEntity.name, candidate);
      showToast(`201 Created — row added to ${targetEntity.name}`);
      return makeResponse(201, 'Created', `Successfully created a new record in ${targetEntity.name}`, {
        statusCode: 201, status: 'Created', message: `Record created`, data: created,
      });
    } catch (err: any) {
      const isConstraint = err.message?.includes('violation') || err.message?.includes('cardinality');
      return makeResponse(isConstraint ? 409 : 400, isConstraint ? 'Conflict' : 'Bad Request', err.message, {
        statusCode: isConstraint ? 409 : 400, status: isConstraint ? 'Conflict' : 'Bad Request',
        error: isConstraint ? 'Database Constraint Violation' : 'Invalid Request Payload', details: err.message,
      });
    }
  }

  if (methodType === 'PUT') {
    try {
      const parsed = JSON.parse(requestBodyText || '{}');
      const idx = rows.findIndex((r) => SeedEngine.getRowCompositeKey(targetEntity, r) === targetId);
      if (idx === -1) {
        return makeResponse(404, 'Not Found', `Cannot update: no record has ${pkFieldName} = "${targetId}"`, {
          statusCode: 404, status: 'Not Found', error: `Record not found.`,
        });
      }

      let workingIR = present;
      Object.entries(parsed).forEach(([k, v]) => {
        workingIR = SeedEngine.updateCellWithIntegrity(
          workingIR,
          targetEntity.name,
          idx,
          k,
          v
        );
      });

      applyAIPatch(workingIR);
      showToast(`200 OK — updated record in ${targetEntity.name}`);

      const updatedEntity = workingIR.entities.find(e => e.name === targetEntity.name);
      const finalUpdatedRow = updatedEntity?.seedData?.[idx] || {};

      return makeResponse(200, 'OK', `Successfully updated record "${targetId}" in ${targetEntity.name}`, {
        statusCode: 200, status: 'OK', message: `Record updated successfully`, data: finalUpdatedRow,
      });
    } catch (err: any) {
      const isConstraint = err.message?.includes('violation') || err.message?.includes('cardinality');
      return makeResponse(isConstraint ? 409 : 400, isConstraint ? 'Conflict' : 'Bad Request', err.message, {
        statusCode: isConstraint ? 409 : 400, status: isConstraint ? 'Conflict' : 'Bad Request',
        error: isConstraint ? 'Database Constraint Violation' : 'Invalid Request Payload', details: err.message,
      });
    }
  }

  // DELETE
  const idx = rows.findIndex((r) => SeedEngine.getRowCompositeKey(targetEntity, r) === targetId);
  if (idx === -1) {
    return makeResponse(404, 'Not Found', `Cannot delete: no record has ${pkFieldName} = "${targetId}"`, {
      statusCode: 404, status: 'Not Found', error: `Record not found.`,
    });
  }

  const deletedSnapshot = rows[idx];
  try {
    const result = SeedEngine.deleteRowWithIntegrity(present, targetEntity.name, idx);
    applyAIPatch(result.ir);
    showToast(`200 OK — ${result.message}`);

    return makeResponse(200, 'OK', `Successfully deleted record "${targetId}" from ${targetEntity.name}`, {
      statusCode: 200, status: 'OK', message: result.message, deletedId: targetId, deletedRecord: deletedSnapshot,
    });
  } catch (err: any) {
    return makeResponse(409, 'Conflict', err.message, {
      statusCode: 409, status: 'Conflict', error: 'Referential Integrity Constraint Violation', details: err.message,
    });
  }
}
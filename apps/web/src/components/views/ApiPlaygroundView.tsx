import { useState, useEffect, useMemo } from 'react';
import { useArchitectureStore } from '../../store/architectureStore';
import { SeedEngine, isFieldPk } from '../../lib/seedEngine';
import type { Field } from '@zero-dollar/ir-core';

type EndpointMethod = 'GET_LIST' | 'GET_ID' | 'POST' | 'PUT' | 'DELETE';
type BodyMode = 'table' | 'json';
type ActiveReqTab = 'params' | 'body';

interface EndpointSelection {
  entityName: string;
  methodType: EndpointMethod;
}

interface KeyValueField {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
  type: Field['type'];
  fkInfo?: {
    parentEntity: string;
    parentPkField: string;
    options: string[];
  };
}

interface QueryParamRow {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
}

const VERB_PILL_STYLES: Record<string, string> = {
  GET: 'text-[#8fbf6b] bg-[#8fbf6b]/14 border-[#8fbf6b]/30',
  POST: 'text-[#e08a3c] bg-[#e08a3c]/14 border-[#e08a3c]/30',
  PUT: 'text-[#3fc6d8] bg-[#3fc6d8]/14 border-[#3fc6d8]/30',
  DELETE: 'text-[#e0708f] bg-[#e0708f]/14 border-[#e0708f]/30',
};

const METHODS_ORDER: EndpointMethod[] = ['GET_LIST', 'GET_ID', 'POST', 'PUT', 'DELETE'];

function formatByteSize(str: string): string {
  const bytes = new Blob([str]).size;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ApiPlaygroundView() {
  const {
    present,
    setIsApiPlaygroundOpen,
    setEntitySeedData,
    addTableRow,
    applyAIPatch,
    showToast,
  } = useArchitectureStore();

  const defaultEntity =
    present.entities.find((e) => e.name === 'orders')?.name ||
    present.entities[0]?.name ||
    '';

  const [selectedEp, setSelectedEp] = useState<EndpointSelection>({
    entityName: defaultEntity,
    methodType: 'GET_LIST',
  });

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<ActiveReqTab>('params');
  const [bodyMode, setBodyMode] = useState<BodyMode>('table');

  const [pathIdParam, setPathIdParam] = useState<string>('');
  const [queryParams, setQueryParams] = useState<QueryParamRow[]>([
    { id: 'qp_1', enabled: false, key: '', value: '' },
  ]);

  const [kvFields, setKvFields] = useState<KeyValueField[]>([]);
  const [requestBodyText, setRequestBodyText] = useState<string>('{\n  \n}');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [responseState, setResponseState] = useState<{
    status: number;
    statusText: string;
    summaryMessage: string;
    sizeLabel: string;
    body: string;
  } | null>(null);

  const targetEntity = present.entities.find((e) => e.name === selectedEp.entityName);
  const resolvedRelations = useMemo(() => SeedEngine.resolveAllRelations(present), [present]);

  const pkFieldName = useMemo(() => {
    if (!targetEntity) return 'id';
    const incomingFks = new Set(
      resolvedRelations
        .filter((r) => r.childEntity === targetEntity.name)
        .map((r) => r.childFkField)
    );
    return (
      targetEntity.fields.find((f) => !incomingFks.has(f.name) && isFieldPk(f))?.name ||
      targetEntity.fields[0]?.name ||
      'id'
    );
  }, [targetEntity, resolvedRelations]);

  useEffect(() => {
    if (!targetEntity && present.entities.length > 0) {
      setSelectedEp({
        entityName: present.entities[0].name,
        methodType: 'GET_LIST',
      });
    }
  }, [present.entities, targetEntity]);

  const buildSamplePayload = () => {
    if (!targetEntity) return;
    const rows = targetEntity.seedData || [];
    const sampleRow = rows[0];

    const incomingRels = resolvedRelations.filter(
      (r) => r.childEntity === targetEntity.name
    );
    const fkFieldSet = new Set(incomingRels.map((r) => r.childFkField));

    const nextKv: KeyValueField[] = [];
    const sampleObj: Record<string, any> = {};

    targetEntity.fields.forEach((f) => {
      const isFk = fkFieldSet.has(f.name);
      const isTruePk = !isFk && isFieldPk(f);
      if (isTruePk && selectedEp.methodType === 'POST') return;

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
          (selectedEp.methodType === 'PUT' && sampleRow?.[f.name]) ||
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

      if (!(isTruePk && selectedEp.methodType === 'PUT')) {
        sampleObj[f.name] = val;
        nextKv.push({
          id: `kv_${f.name}`,
          enabled: true,
          key: f.name,
          value: String(val),
          type: f.type,
          fkInfo,
        });
      }
    });

    setKvFields(nextKv);
    setRequestBodyText(JSON.stringify(sampleObj, null, 2));
    setJsonError(null);
  };

  useEffect(() => {
    setResponseState(null);
    if (!targetEntity) return;

    const rows = targetEntity.seedData || [];
    const sampleRow = rows[0];
    const firstId = sampleRow?.[pkFieldName] ?? sampleRow?.id;
    setPathIdParam(firstId !== undefined ? String(firstId) : '');

    const needsBody =
      selectedEp.methodType === 'POST' || selectedEp.methodType === 'PUT';
    setActiveTab(needsBody ? 'body' : 'params');

    if (needsBody) {
      buildSamplePayload();
    }
  }, [selectedEp.entityName, selectedEp.methodType, targetEntity?.name]);

  // Sync Key-Value Table changes -> Raw JSON string
  const syncKvToJson = (updatedKv: KeyValueField[]) => {
    setKvFields(updatedKv);
    const obj: Record<string, any> = {};
    updatedKv.forEach((item) => {
      if (!item.enabled || !item.key.trim()) return;
      const fieldDef = targetEntity?.fields.find((f) => f.name === item.key.trim());
      obj[item.key.trim()] = SeedEngine.coerceCellValue(
        fieldDef || ({ name: item.key, type: item.type, nullable: false, unique: false } as Field),
        item.value
      );
    });
    setRequestBodyText(JSON.stringify(obj, null, 2));
    setJsonError(null);
  };

  // Sync Raw JSON string changes -> Key-Value Table
  const handleRawJsonChange = (raw: string) => {
    setRequestBodyText(raw);
    try {
      const parsed = JSON.parse(raw || '{}');
      setJsonError(null);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const incomingRels = resolvedRelations.filter(
          (r) => r.childEntity === targetEntity?.name
        );
        const nextKv: KeyValueField[] = Object.entries(parsed).map(([k, v], idx) => {
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
            type: fieldDef?.type || (typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string'),
            fkInfo,
          };
        });
        setKvFields(nextKv);
      }
    } catch (err: any) {
      setJsonError(err.message);
    }
  };

  const commitResponse = (
    status: number,
    statusText: string,
    summaryMessage: string,
    payloadObj: any
  ) => {
    const formatted = JSON.stringify(payloadObj, null, 2);
    setResponseState({
      status,
      statusText,
      summaryMessage,
      sizeLabel: formatByteSize(formatted),
      body: formatted,
    });
  };

  const handleExecute = () => {
    if (!targetEntity) return;
    const rows = [...(targetEntity.seedData || [])];

    // 1. GET LIST (with optional Query Param filtering)
    if (selectedEp.methodType === 'GET_LIST') {
      const activeFilters = queryParams.filter((q) => q.enabled && q.key.trim() !== '');
      const filteredRows = rows.filter((row) =>
        activeFilters.every((q) =>
          String(row[q.key.trim()] ?? '')
            .toLowerCase()
            .includes(q.value.trim().toLowerCase())
        )
      );

      commitResponse(
        200,
        'OK',
        `Fetched ${filteredRows.length} record(s) from ${targetEntity.name}`,
        {
          statusCode: 200,
          status: 'OK',
          count: filteredRows.length,
          data: filteredRows,
        }
      );
      return;
    }

    // 2. GET BY ID
    if (selectedEp.methodType === 'GET_ID') {
      const targetId = pathIdParam.trim();
      const found = rows.find(
        (r) => String(r[pkFieldName] ?? r.id) === targetId
      );

      if (!found) {
        commitResponse(
          404,
          'Not Found',
          `No record in ${targetEntity.name} matches ${pkFieldName} = "${targetId}"`,
          {
            statusCode: 404,
            status: 'Not Found',
            error: `Record with ${pkFieldName} "${targetId}" was not found in ${targetEntity.name}.`,
          }
        );
        return;
      }

      commitResponse(
        200,
        'OK',
        `Fetched record "${targetId}" from ${targetEntity.name}`,
        {
          statusCode: 200,
          status: 'OK',
          data: found,
        }
      );
      return;
    }

    // 3. POST (Create Record)
    if (selectedEp.methodType === 'POST') {
      try {
        const parsed = JSON.parse(requestBodyText || '{}');
        const candidate = SeedEngine.createBlankRow(targetEntity, parsed, present);
        SeedEngine.validateRowConstraints(present, targetEntity.name, candidate, -1);
        const created = addTableRow(targetEntity.name, candidate);

        showToast(`201 Created — row added to ${targetEntity.name}`);
        commitResponse(
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
        const isConstraintErr =
          err.message?.includes('violation') || err.message?.includes('cardinality');
        commitResponse(
          isConstraintErr ? 409 : 400,
          isConstraintErr ? 'Conflict' : 'Bad Request',
          err.message,
          {
            statusCode: isConstraintErr ? 409 : 400,
            status: isConstraintErr ? 'Conflict' : 'Bad Request',
            error: isConstraintErr ? 'Database Constraint Violation' : 'Invalid Request Payload',
            details: err.message,
          }
        );
      }
      return;
    }

    // 4. PUT (Update Record by ID)
    if (selectedEp.methodType === 'PUT') {
      try {
        const targetId = pathIdParam.trim();
        const parsed = JSON.parse(requestBodyText || '{}');
        const idx = rows.findIndex(
          (r) => String(r[pkFieldName] ?? r.id) === targetId
        );

        if (idx === -1) {
          commitResponse(
            404,
            'Not Found',
            `Cannot update: no record in ${targetEntity.name} has ${pkFieldName} = "${targetId}"`,
            {
              statusCode: 404,
              status: 'Not Found',
              error: `Record with ${pkFieldName} "${targetId}" does not exist in "${targetEntity.name}".`,
            }
          );
          return;
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
        commitResponse(
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
        const isConstraintErr =
          err.message?.includes('violation') || err.message?.includes('cardinality');
        commitResponse(
          isConstraintErr ? 409 : 400,
          isConstraintErr ? 'Conflict' : 'Bad Request',
          err.message,
          {
            statusCode: isConstraintErr ? 409 : 400,
            status: isConstraintErr ? 'Conflict' : 'Bad Request',
            error: isConstraintErr ? 'Database Constraint Violation' : 'Invalid Request Payload',
            details: err.message,
          }
        );
      }
      return;
    }

    // 5. DELETE (Delete Record by ID with Referential Integrity)
    if (selectedEp.methodType === 'DELETE') {
      const targetId = pathIdParam.trim();
      const idx = rows.findIndex(
        (r) => String(r[pkFieldName] ?? r.id) === targetId
      );

      if (idx === -1) {
        commitResponse(
          404,
          'Not Found',
          `Cannot delete: no record in ${targetEntity.name} has ${pkFieldName} = "${targetId}"`,
          {
            statusCode: 404,
            status: 'Not Found',
            error: `Record with ${pkFieldName} "${targetId}" was not found in "${targetEntity.name}".`,
          }
        );
        return;
      }

      const deletedSnapshot = rows[idx];
      try {
        const result = SeedEngine.deleteRowWithIntegrity(present, targetEntity.name, idx);
        applyAIPatch(result.ir);
        showToast(`200 OK — ${result.message}`);

        commitResponse(
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
        commitResponse(409, 'Conflict', err.message, {
          statusCode: 409,
          status: 'Conflict',
          error: 'Referential Integrity Constraint Violation',
          details: err.message,
        });
      }
    }
  };

  const getEndpointMeta = (entityName: string, methodType: EndpointMethod) => {
    const base = `/v1/${entityName.toLowerCase()}`;
    switch (methodType) {
      case 'GET_LIST':
        return { verb: 'GET', path: base, desc: `List and filter records in ${entityName}` };
      case 'GET_ID':
        return {
          verb: 'GET',
          path: `${base}/{id}`,
          desc: `Fetch a single ${entityName} record by primary key`,
        };
      case 'POST':
        return { verb: 'POST', path: base, desc: `Insert a new record into ${entityName}` };
      case 'PUT':
        return {
          verb: 'PUT',
          path: `${base}/{id}`,
          desc: `Update an existing ${entityName} record by primary key`,
        };
      case 'DELETE':
        return {
          verb: 'DELETE',
          path: `${base}/{id}`,
          desc: `Delete a ${entityName} record (enforces FK RESTRICT / CASCADE)`,
        };
    }
  };

  const activeMeta = getEndpointMeta(selectedEp.entityName, selectedEp.methodType);
  const needsIdParam =
    selectedEp.methodType === 'GET_ID' ||
    selectedEp.methodType === 'PUT' ||
    selectedEp.methodType === 'DELETE';
  const needsBody =
    selectedEp.methodType === 'POST' || selectedEp.methodType === 'PUT';

  const existingIds = useMemo(() => {
    if (!targetEntity?.seedData) return [];
    return targetEntity.seedData
      .map((r) => String(r[pkFieldName] ?? r.id ?? ''))
      .filter(Boolean);
  }, [targetEntity?.seedData, pkFieldName]);

  const liveUrlPreview = useMemo(() => {
    const base = `/v1/${selectedEp.entityName.toLowerCase()}`;
    if (needsIdParam) {
      return `${base}/${pathIdParam.trim() || ':id'}`;
    }
    if (selectedEp.methodType === 'GET_LIST') {
      const qs = queryParams
        .filter((q) => q.enabled && q.key.trim())
        .map((q) => `${encodeURIComponent(q.key.trim())}=${encodeURIComponent(q.value.trim())}`)
        .join('&');
      return qs ? `${base}?${qs}` : base;
    }
    return base;
  }, [selectedEp, needsIdParam, pathIdParam, queryParams]);

  return (
    <div className="absolute inset-0 z-28 flex flex-col bg-[#0b0c10] select-none">
      {/* Top Header */}
      <div className="h-[58px] px-5 border-b border-white/[0.09] flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={() => setIsApiPlaygroundOpen(false)}
          className="px-3.5 py-2 rounded-[8px] border border-white/[0.09] bg-[#14161d] hover:bg-white/[0.06] text-[12.5px] flex items-center gap-2 cursor-pointer transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-3.5 h-3.5 text-[#8a8b9a]"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Schema Visualizer
        </button>

        <span className="text-[10px] font-mono px-2.5 py-1 rounded-full uppercase tracking-[0.4px] text-[#3fc6d8] bg-[#3fc6d8]/14 font-semibold">
          REST Client
        </span>

        <span className="font-mono text-[15px] font-semibold text-[#e8e8ee]">
          API Playground
        </span>

        <span className="text-[12px] text-[#565766] ml-1">
          Live constraint-checked execution against your seeded tables
        </span>
      </div>

      {/* Main Split Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Endpoints Sidebar */}
        <div className="w-[252px] border-r border-white/[0.09] bg-[#0b0c10] overflow-y-auto p-2.5 space-y-2 flex-none">
          {present.entities.map((ent) => {
            const isCollapsed = !!collapsedGroups[ent.name];
            const rowCount = ent.seedData?.length || 0;
            return (
              <div key={ent.name}>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedGroups((p) => ({ ...p, [ent.name]: !p[ent.name] }))
                  }
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[12px] font-mono font-semibold text-[#e8e8ee] hover:text-white cursor-pointer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`w-2.5 h-2.5 text-[#565766] transition-transform ${
                      isCollapsed ? 'rotate-0' : 'rotate-90'
                    }`}
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                  <span className="truncate">{ent.name}</span>
                  <span className="ml-auto text-[10px] font-normal text-[#565766]">
                    {rowCount} {rowCount === 1 ? 'row' : 'rows'}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="space-y-1 mt-0.5">
                    {METHODS_ORDER.map((mType) => {
                      const meta = getEndpointMeta(ent.name, mType);
                      const isSelected =
                        selectedEp.entityName === ent.name &&
                        selectedEp.methodType === mType;

                      return (
                        <button
                          key={mType}
                          type="button"
                          onClick={() =>
                            setSelectedEp({ entityName: ent.name, methodType: mType })
                          }
                          className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-[8px] font-mono text-[11.5px] transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#e08a3c]/14 border border-[#e08a3c]/35 text-[#e08a3c]'
                              : 'border border-transparent text-[#8a8b9a] hover:bg-white/[0.04] hover:text-[#e8e8ee]'
                          }`}
                        >
                          <span
                            className={`w-[44px] flex-none text-center font-semibold text-[9.5px] rounded-[4px] py-[2px] uppercase border ${
                              VERB_PILL_STYLES[meta.verb]
                            }`}
                          >
                            {meta.verb}
                          </span>
                          <span className="truncate">{meta.path}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Postman Workspace */}
        <div className="flex-1 overflow-y-auto p-6">
          {targetEntity ? (
            <div className="max-w-4xl space-y-5">
              {/* Postman-Style URL Bar + Send Button */}
              <div className="flex items-center gap-2.5">
                <div className="flex-1 flex items-center bg-[#101219] border border-white/[0.1] rounded-[10px] p-1.5 gap-2.5">
                  <span
                    className={`px-3 py-1.5 rounded-[7px] font-mono text-[11px] font-semibold uppercase border ${
                      VERB_PILL_STYLES[activeMeta.verb]
                    }`}
                  >
                    {activeMeta.verb}
                  </span>
                  <span className="font-mono text-[13.5px] text-[#e8e8ee] select-text truncate">
                    {liveUrlPreview}
                  </span>
                  <span className="ml-auto text-[11.5px] text-[#565766] pr-2 hidden md:inline">
                    {activeMeta.desc}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleExecute}
                  className="px-6 py-2.5 rounded-[10px] text-[13px] font-semibold text-[#1a1206] bg-gradient-to-br from-[#e08a3c] to-[#c9692a] hover:brightness-110 cursor-pointer transition-all shadow-lg shrink-0"
                >
                  Send
                </button>
              </div>

              {/* Request Section Tabs (Params | Body) */}
              <div className="border border-white/[0.09] rounded-xl bg-[#101219] overflow-hidden">
                <div className="px-4 border-b border-white/[0.08] bg-[#14161d]/70 flex items-center gap-6 h-[42px]">
                  <button
                    type="button"
                    onClick={() => setActiveTab('params')}
                    className={`h-full text-[12.5px] font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'params'
                        ? 'border-[#e08a3c] text-[#e8e8ee]'
                        : 'border-transparent text-[#8a8b9a] hover:text-[#e8e8ee]'
                    }`}
                  >
                    Params
                    {needsIdParam && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#e08a3c]" />
                    )}
                  </button>

                  {needsBody && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('body')}
                      className={`h-full text-[12.5px] font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                        activeTab === 'body'
                          ? 'border-[#e08a3c] text-[#e8e8ee]'
                          : 'border-transparent text-[#8a8b9a] hover:text-[#e8e8ee]'
                      }`}
                    >
                      Body
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/[0.06] text-[#8fbf6b]">
                        {bodyMode === 'table' ? 'form-table' : 'json'}
                      </span>
                    </button>
                  )}
                </div>

                {/* TAB 1: PARAMS (Path Variables & Query Params) */}
                {activeTab === 'params' && (
                  <div className="p-4 space-y-4">
                    {needsIdParam && (
                      <div>
                        <div className="text-[11px] font-mono uppercase tracking-wider text-[#8a8b9a] mb-2">
                          Path Variables
                        </div>
                        <div className="border border-white/[0.08] rounded-lg overflow-hidden">
                          <table className="w-full text-left font-mono text-[12px] border-collapse">
                            <thead>
                              <tr className="bg-[#14161d] border-b border-white/[0.08] text-[#565766] text-[11px]">
                                <th className="py-2 px-3 w-36">Key</th>
                                <th className="py-2 px-3">Value</th>
                                <th className="py-2 px-3 w-56">Quick Pick Seeded ID</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="py-2 px-3 text-[#e08a3c] font-semibold">
                                  {pkFieldName}
                                </td>
                                <td className="py-2 px-3">
                                  <input
                                    type="text"
                                    value={pathIdParam}
                                    onChange={(e) => setPathIdParam(e.target.value)}
                                    placeholder={`Enter ${pkFieldName}…`}
                                    className="w-full bg-[#0b0c10] border border-white/[0.09] focus:border-[#e08a3c]/60 rounded px-2.5 py-1.5 text-[#e8e8ee] outline-none"
                                  />
                                </td>
                                <td className="py-2 px-3">
                                  <select
                                    value={existingIds.includes(pathIdParam) ? pathIdParam : ''}
                                    onChange={(e) => {
                                      if (e.target.value) setPathIdParam(e.target.value);
                                    }}
                                    className="w-full bg-[#0b0c10] border border-white/[0.09] rounded px-2 py-1.5 text-[#8a8b9a] hover:text-[#e8e8ee] outline-none cursor-pointer"
                                  >
                                    <option value="">
                                      {existingIds.length > 0
                                        ? `Select from ${existingIds.length} row(s)…`
                                        : 'No seeded rows yet'}
                                    </option>
                                    {existingIds.map((idVal, i) => (
                                      <option key={i} value={idVal}>
                                        Row #{i + 1}: {idVal.slice(0, 18)}…
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {selectedEp.methodType === 'GET_LIST' && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-mono uppercase tracking-wider text-[#8a8b9a]">
                            Query Parameters (Filter Records)
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setQueryParams((prev) => [
                                ...prev,
                                {
                                  id: `qp_${Date.now()}`,
                                  enabled: true,
                                  key: targetEntity.fields[0]?.name || '',
                                  value: '',
                                },
                              ])
                            }
                            className="text-[11.5px] font-mono text-[#e08a3c] hover:underline cursor-pointer"
                          >
                            + Add filter
                          </button>
                        </div>

                        <div className="border border-white/[0.08] rounded-lg overflow-hidden">
                          <table className="w-full text-left font-mono text-[12px] border-collapse">
                            <thead>
                              <tr className="bg-[#14161d] border-b border-white/[0.08] text-[#565766] text-[11px]">
                                <th className="py-2 px-3 w-10 text-center">✓</th>
                                <th className="py-2 px-3 w-48">Column Key</th>
                                <th className="py-2 px-3">Filter Value (contains)</th>
                                <th className="py-2 px-3 w-10" />
                              </tr>
                            </thead>
                            <tbody>
                              {queryParams.map((qp, idx) => (
                                <tr
                                  key={qp.id}
                                  className="border-b border-white/[0.05] last:border-b-0"
                                >
                                  <td className="py-2 px-3 text-center">
                                    <input
                                      type="checkbox"
                                      checked={qp.enabled}
                                      onChange={(e) =>
                                        setQueryParams((prev) =>
                                          prev.map((item, i) =>
                                            i === idx
                                              ? { ...item, enabled: e.target.checked }
                                              : item
                                          )
                                        )
                                      }
                                      className="accent-[#e08a3c] cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-2 px-3">
                                    <select
                                      value={qp.key}
                                      onChange={(e) =>
                                        setQueryParams((prev) =>
                                          prev.map((item, i) =>
                                            i === idx
                                              ? {
                                                  ...item,
                                                  key: e.target.value,
                                                  enabled: true,
                                                }
                                              : item
                                          )
                                        )
                                      }
                                      className="w-full bg-[#0b0c10] border border-white/[0.09] rounded px-2 py-1.5 text-[#e8e8ee] outline-none"
                                    >
                                      <option value="">Select column…</option>
                                      {targetEntity.fields.map((f) => (
                                        <option key={f.name} value={f.name}>
                                          {f.name}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-2 px-3">
                                    <input
                                      type="text"
                                      value={qp.value}
                                      onChange={(e) =>
                                        setQueryParams((prev) =>
                                          prev.map((item, i) =>
                                            i === idx
                                              ? {
                                                  ...item,
                                                  value: e.target.value,
                                                  enabled: true,
                                                }
                                              : item
                                          )
                                        )
                                      }
                                      placeholder="Value to match…"
                                      className="w-full bg-[#0b0c10] border border-white/[0.09] rounded px-2.5 py-1.5 text-[#e8e8ee] outline-none"
                                    />
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    {queryParams.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setQueryParams((prev) =>
                                            prev.filter((_, i) => i !== idx)
                                          )
                                        }
                                        className="text-[#565766] hover:text-[#e0708f] cursor-pointer"
                                      >
                                        ×
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {!needsIdParam && selectedEp.methodType !== 'GET_LIST' && (
                      <div className="text-[12px] text-[#565766] font-mono py-2">
                        No path or query parameters required for this endpoint. Switch to the{' '}
                        <button
                          type="button"
                          onClick={() => setActiveTab('body')}
                          className="text-[#e08a3c] underline cursor-pointer"
                        >
                          Body
                        </button>{' '}
                        tab to configure the request payload.
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: BODY (Postman Table Key-Value vs. Raw JSON) */}
                {activeTab === 'body' && needsBody && (
                  <div className="p-4 space-y-3">
                    {/* Body Format Switcher */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 bg-[#0b0c10] p-1 rounded-lg border border-white/[0.08]">
                        <button
                          type="button"
                          onClick={() => setBodyMode('table')}
                          className={`px-3 py-1 rounded-md text-[11.5px] font-mono transition-colors cursor-pointer ${
                            bodyMode === 'table'
                              ? 'bg-[#e08a3c]/18 text-[#e08a3c] font-semibold'
                              : 'text-[#8a8b9a] hover:text-[#e8e8ee]'
                          }`}
                        >
                          Table (Key-Value)
                        </button>
                        <button
                          type="button"
                          onClick={() => setBodyMode('json')}
                          className={`px-3 py-1 rounded-md text-[11.5px] font-mono transition-colors cursor-pointer ${
                            bodyMode === 'json'
                              ? 'bg-[#e08a3c]/18 text-[#e08a3c] font-semibold'
                              : 'text-[#8a8b9a] hover:text-[#e8e8ee]'
                          }`}
                        >
                          raw (JSON)
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        {bodyMode === 'table' ? (
                          <button
                            type="button"
                            onClick={() =>
                              syncKvToJson([
                                ...kvFields,
                                {
                                  id: `kv_custom_${Date.now()}`,
                                  enabled: true,
                                  key: '',
                                  value: '',
                                  type: 'string',
                                },
                              ])
                            }
                            className="px-2.5 py-1 rounded border border-white/[0.09] bg-white/[0.03] hover:bg-white/[0.07] text-[11.5px] font-mono text-[#e8e8ee] cursor-pointer"
                          >
                            + Add field
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                const clean = JSON.stringify(
                                  JSON.parse(requestBodyText),
                                  null,
                                  2
                                );
                                setRequestBodyText(clean);
                                setJsonError(null);
                              } catch (e: any) {
                                setJsonError(e.message);
                              }
                            }}
                            className="px-2.5 py-1 rounded border border-white/[0.09] bg-white/[0.03] hover:bg-white/[0.07] text-[11.5px] font-mono text-[#3fc6d8] cursor-pointer"
                          >
                            Prettify JSON
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={buildSamplePayload}
                          className="px-2.5 py-1 rounded border border-white/[0.09] bg-white/[0.03] hover:bg-white/[0.07] text-[11.5px] font-mono text-[#8a8b9a] hover:text-[#e8e8ee] cursor-pointer"
                        >
                          Reset sample
                        </button>
                      </div>
                    </div>

                    {/* MODE A: Key-Value Table Editor */}
                    {bodyMode === 'table' ? (
                      <div className="border border-white/[0.08] rounded-lg overflow-hidden">
                        <table className="w-full text-left font-mono text-[12px] border-collapse">
                          <thead>
                            <tr className="bg-[#14161d] border-b border-white/[0.08] text-[#565766] text-[11px]">
                              <th className="py-2 px-3 w-10 text-center">✓</th>
                              <th className="py-2 px-3 w-44">Key</th>
                              <th className="py-2 px-3 w-28">Type</th>
                              <th className="py-2 px-3">Value</th>
                              <th className="py-2 px-3 w-10" />
                            </tr>
                          </thead>
                          <tbody>
                            {kvFields.map((item, idx) => (
                              <tr
                                key={item.id}
                                className="border-b border-white/[0.05] last:border-b-0"
                              >
                                <td className="py-2 px-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={item.enabled}
                                    onChange={(e) => {
                                      const next = kvFields.map((row, i) =>
                                        i === idx
                                          ? { ...row, enabled: e.target.checked }
                                          : row
                                      );
                                      syncKvToJson(next);
                                    }}
                                    className="accent-[#e08a3c] cursor-pointer"
                                  />
                                </td>

                                <td className="py-2 px-3">
                                  <input
                                    type="text"
                                    value={item.key}
                                    onChange={(e) => {
                                      const next = kvFields.map((row, i) =>
                                        i === idx ? { ...row, key: e.target.value } : row
                                      );
                                      syncKvToJson(next);
                                    }}
                                    placeholder="field_name"
                                    className="w-full bg-[#0b0c10] border border-white/[0.08] rounded px-2.5 py-1.5 text-[#e8e8ee] outline-none"
                                  />
                                </td>

                                <td className="py-2 px-3">
                                  {item.fkInfo ? (
                                    <span className="text-[10.5px] px-2 py-0.5 rounded bg-[#3fc6d8]/15 text-[#3fc6d8]">
                                      FK → {item.fkInfo.parentEntity}
                                    </span>
                                  ) : (
                                    <select
                                      value={item.type}
                                      onChange={(e) => {
                                        const next = kvFields.map((row, i) =>
                                          i === idx
                                            ? {
                                                ...row,
                                                type: e.target.value as Field['type'],
                                              }
                                            : row
                                        );
                                        syncKvToJson(next);
                                      }}
                                      className="w-full bg-[#0b0c10] border border-white/[0.08] rounded px-2 py-1.5 text-[#8a8b9a] outline-none"
                                    >
                                      <option value="string">text</option>
                                      <option value="number">numeric</option>
                                      <option value="boolean">boolean</option>
                                      <option value="uuid">uuid</option>
                                      <option value="datetime">datetime</option>
                                    </select>
                                  )}
                                </td>

                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={item.value}
                                      onChange={(e) => {
                                        const next = kvFields.map((row, i) =>
                                          i === idx
                                            ? { ...row, value: e.target.value }
                                            : row
                                        );
                                        syncKvToJson(next);
                                      }}
                                      placeholder="Value…"
                                      className="flex-1 bg-[#0b0c10] border border-white/[0.08] focus:border-[#e08a3c]/60 rounded px-2.5 py-1.5 text-[#e8e8ee] outline-none"
                                    />

                                    {item.fkInfo && item.fkInfo.options.length > 0 && (
                                      <select
                                        value={
                                          item.fkInfo.options.includes(item.value)
                                            ? item.value
                                            : ''
                                        }
                                        onChange={(e) => {
                                          if (!e.target.value) return;
                                          const next = kvFields.map((row, i) =>
                                            i === idx
                                              ? { ...row, value: e.target.value }
                                              : row
                                          );
                                          syncKvToJson(next);
                                        }}
                                        className="w-40 bg-[#0b0c10] border border-white/[0.08] rounded px-2 py-1.5 text-[#3fc6d8] text-[11px] outline-none cursor-pointer"
                                      >
                                        <option value="">Pick {item.fkInfo.parentEntity} ID…</option>
                                        {item.fkInfo.options.map((optId, oIdx) => (
                                          <option key={oIdx} value={optId}>
                                            {optId.slice(0, 14)}…
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                </td>

                                <td className="py-2 px-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      syncKvToJson(kvFields.filter((_, i) => i !== idx))
                                    }
                                    className="text-[#565766] hover:text-[#e0708f] cursor-pointer"
                                  >
                                    ×
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      /* MODE B: Raw JSON Editor */
                      <div>
                        <textarea
                          value={requestBodyText}
                          onChange={(e) => handleRawJsonChange(e.target.value)}
                          spellCheck={false}
                          className="w-full min-h-[180px] bg-[#0b0c10] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-[8px] p-3.5 font-mono text-[12.5px] leading-[1.6] text-[#e8e8ee] outline-none resize-y"
                        />
                        {jsonError && (
                          <div className="mt-1.5 text-[11.5px] font-mono text-[#e0708f]">
                            Invalid JSON: {jsonError}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Response Panel */}
              {responseState && (
                <div className="border border-white/[0.09] rounded-xl bg-[#101219] overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-white/[0.08] bg-[#14161d]/70 flex items-center gap-3 font-mono text-[11.5px]">
                    <span className="text-[#8a8b9a] uppercase tracking-wider text-[10.5px]">
                      Response
                    </span>

                    <span
                      className={`px-2.5 py-0.5 rounded font-semibold ${
                        responseState.status >= 200 && responseState.status < 300
                          ? 'bg-[#8fbf6b]/15 text-[#8fbf6b] border border-[#8fbf6b]/30'
                          : 'bg-[#e0708f]/15 text-[#e0708f] border border-[#e0708f]/30'
                      }`}
                    >
                      {responseState.status} {responseState.statusText}
                    </span>

                    <span className="text-[#565766]">{responseState.sizeLabel}</span>

                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(responseState.body);
                        showToast('Response JSON copied');
                      }}
                      className="ml-auto px-2.5 py-1 rounded border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-[#8a8b9a] hover:text-[#e8e8ee] text-[11px] cursor-pointer"
                    >
                      Copy JSON
                    </button>
                  </div>

                  {/* Explicit Status Summary Banner */}
                  <div
                    className={`px-4 py-2.5 border-b text-[12.5px] font-mono flex items-center gap-2 ${
                      responseState.status >= 200 && responseState.status < 300
                        ? 'bg-[#8fbf6b]/[0.07] border-[#8fbf6b]/20 text-[#8fbf6b]'
                        : 'bg-[#e0708f]/[0.07] border-[#e0708f]/20 text-[#e0708f]'
                    }`}
                  >
                    <span>
                      {responseState.status >= 200 && responseState.status < 300 ? '✓' : '✕'}
                    </span>
                    <span>{responseState.summaryMessage}</span>
                  </div>

                  <pre className="p-4 font-mono text-[12px] leading-[1.65] text-[#e8e8ee] max-h-[380px] overflow-auto select-text">
                    {responseState.body}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="text-[13px] text-[#565766] font-mono">
              Add a table on the canvas to test REST endpoints.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
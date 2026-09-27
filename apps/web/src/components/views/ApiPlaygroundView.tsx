import { useState, useEffect } from 'react';
import { useArchitectureStore } from '../../store/architectureStore';
import { SeedEngine } from '../../lib/seedEngine';

type EndpointMethod = 'GET_LIST' | 'GET_ID' | 'POST' | 'PUT' | 'DELETE';

interface EndpointSelection {
  entityName: string;
  methodType: EndpointMethod;
}

const VERB_PILL_STYLES: Record<string, string> = {
  GET: 'text-[#8fbf6b] bg-[#8fbf6b]/14',
  POST: 'text-[#e08a3c] bg-[#e08a3c]/14',
  PUT: 'text-[#3fc6d8] bg-[#3fc6d8]/14',
  DELETE: 'text-[#e0708f] bg-[#e0708f]/14',
};

const METHODS_ORDER: EndpointMethod[] = ['GET_LIST', 'GET_ID', 'POST', 'PUT', 'DELETE'];

export function ApiPlaygroundView() {
  const {
    present,
    setIsApiPlaygroundOpen,
    setEntitySeedData,
    addTableRow,
    applyAIPatch,
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
  const [pathIdParam, setPathIdParam] = useState<string>('');
  const [requestBodyText, setRequestBodyText] = useState<string>('{\n  \n}');
  const [responseState, setResponseState] = useState<{
    status: number;
    timeMs: number;
    body: string;
  } | null>(null);

  const targetEntity = present.entities.find((e) => e.name === selectedEp.entityName);

  useEffect(() => {
    if (!targetEntity && present.entities.length > 0) {
      setSelectedEp({
        entityName: present.entities[0].name,
        methodType: 'GET_LIST',
      });
    }
  }, [present.entities, targetEntity]);

  useEffect(() => {
    setResponseState(null);
    if (!targetEntity) return;

    const rows = targetEntity.seedData || [];
    const sampleRow = rows[0];
    setPathIdParam(sampleRow?.id ? String(sampleRow.id) : crypto.randomUUID());

    if (selectedEp.methodType === 'POST' || selectedEp.methodType === 'PUT') {
      const resolvedRels = SeedEngine.resolveAllRelations(present).filter(
        (r) => r.childEntity === targetEntity.name
      );
      const sampleBody: Record<string, any> = {};

      targetEntity.fields.forEach((f) => {
        if (f.isPrimaryKey || f.name === 'id') return;

        const fkRel = resolvedRels.find((r) => r.childFkField === f.name);
        if (fkRel) {
          const parentEnt = present.entities.find((e) => e.name === fkRel.parentEntity);
          const parentRow = parentEnt?.seedData?.[0];
          sampleBody[f.name] =
            parentRow?.[fkRel.parentPkField] ??
            parentRow?.id ??
            sampleRow?.[f.name] ??
            crypto.randomUUID();
          return;
        }

        if (sampleRow && sampleRow[f.name] !== undefined) {
          sampleBody[f.name] = sampleRow[f.name];
        } else if (f.type === 'uuid') {
          sampleBody[f.name] = crypto.randomUUID();
        } else if (f.type === 'number') {
          sampleBody[f.name] = 100;
        } else if (f.type === 'boolean') {
          sampleBody[f.name] = true;
        } else if (f.name === 'status') {
          sampleBody[f.name] = 'cancelled';
        } else {
          sampleBody[f.name] = 'sample';
        }
      });
      setRequestBodyText(JSON.stringify(sampleBody, null, 2));
    }
  }, [selectedEp.entityName, selectedEp.methodType, targetEntity?.name, present]);
  
  const handleExecute = () => {
    if (!targetEntity) return;
    const rows = [...(targetEntity.seedData || [])];
    const elapsed = Math.floor(Math.random() * 22) + 8;

    if (selectedEp.methodType === 'GET_LIST') {
      setResponseState({
        status: 200,
        timeMs: elapsed,
        body: JSON.stringify(rows, null, 2),
      });
      return;
    }

    if (selectedEp.methodType === 'GET_ID') {
      const found = rows.find((r) => String(r.id) === pathIdParam.trim());
      setResponseState({
        status: found ? 200 : 404,
        timeMs: elapsed,
        body: JSON.stringify(found ?? { error: 'Not found' }, null, 2),
      });
      return;
    }

    if (selectedEp.methodType === 'POST') {
      try {
        const parsed = JSON.parse(requestBodyText || '{}');
        SeedEngine.validateForeignKeys(present, targetEntity.name, parsed);
        const created = addTableRow(targetEntity.name, parsed);
        setResponseState({
          status: 201,
          timeMs: elapsed,
          body: JSON.stringify(created, null, 2),
        });
      } catch (err: any) {
        const isFkErr = err.message?.includes('Foreign key violation');
        setResponseState({
          status: isFkErr ? 409 : 400,
          timeMs: elapsed,
          body: JSON.stringify(
            { error: isFkErr ? 'Foreign Key Constraint Failed' : 'Invalid JSON body', details: err.message },
            null,
            2
          ),
        });
      }
      return;
    }

    if (selectedEp.methodType === 'PUT') {
      try {
        const parsed = JSON.parse(requestBodyText || '{}');
        const idx = rows.findIndex((r) => String(r.id) === pathIdParam.trim());
        if (idx === -1) {
          const fallbackRecord = { id: pathIdParam.trim() || crypto.randomUUID(), ...parsed };
          setEntitySeedData(targetEntity.name, [...rows, fallbackRecord]);
          setResponseState({
            status: 200,
            timeMs: elapsed,
            body: JSON.stringify(fallbackRecord, null, 2),
          });
        } else {
          const updated = { ...rows[idx], ...parsed, id: rows[idx].id };
          rows[idx] = updated;
          setEntitySeedData(targetEntity.name, rows);
          setResponseState({
            status: 200,
            timeMs: elapsed,
            body: JSON.stringify(updated, null, 2),
          });
        }
      } catch (err: any) {
        setResponseState({
          status: 400,
          timeMs: elapsed,
          body: JSON.stringify({ error: 'Invalid JSON body', details: err.message }, null, 2),
        });
      }
      return;
    }

    if (selectedEp.methodType === 'DELETE') {
      const idx = rows.findIndex((r) => String(r.id) === pathIdParam.trim());
      if (idx === -1) {
        setResponseState({
          status: 204,
          timeMs: elapsed,
          body: 'null',
        });
        return;
      }
      try {
        const result = SeedEngine.deleteRowWithIntegrity(present, targetEntity.name, idx);
        applyAIPatch(result.ir);
        setResponseState({
          status: 204,
          timeMs: elapsed,
          body: 'null',
        });
      } catch (err: any) {
        setResponseState({
          status: 409,
          timeMs: elapsed,
          body: JSON.stringify({ error: 'Referential Integrity Violation', details: err.message }, null, 2),
        });
      }
    }
  };

  const getEndpointMeta = (entityName: string, methodType: EndpointMethod) => {
    const base = `/v1/${entityName.toLowerCase()}`;
    switch (methodType) {
      case 'GET_LIST':
        return { verb: 'GET', path: base, desc: `List all ${entityName}` };
      case 'GET_ID':
        return {
          verb: 'GET',
          path: `${base}/{id}`,
          desc: `Fetch a single ${entityName} record by id`,
        };
      case 'POST':
        return { verb: 'POST', path: base, desc: `Create a new ${entityName} record` };
      case 'PUT':
        return {
          verb: 'PUT',
          path: `${base}/{id}`,
          desc: `Update a ${entityName} record by id`,
        };
      case 'DELETE':
        return {
          verb: 'DELETE',
          path: `${base}/{id}`,
          desc: `Delete a ${entityName} record by id`,
        };
    }
  };

  const activeMeta = getEndpointMeta(selectedEp.entityName, selectedEp.methodType);
  const needsIdParam =
    selectedEp.methodType === 'GET_ID' ||
    selectedEp.methodType === 'PUT' ||
    selectedEp.methodType === 'DELETE';
  const needsBody = selectedEp.methodType === 'POST' || selectedEp.methodType === 'PUT';

  return (
    <div className="absolute inset-0 z-28 flex flex-col bg-[#0b0c10] select-none">
      {/* Playground Header */}
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
          API
        </span>

        <span className="font-mono text-[15px] font-semibold text-[#e8e8ee]">
          Playground
        </span>

        <span className="text-[12px] text-[#565766] ml-1">
          Simulated against your seeded data
        </span>
      </div>

      {/* Playground Split Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Routes Sidebar */}
        <div className="w-[248px] border-r border-white/[0.09] bg-[#0b0c10] overflow-y-auto p-2.5 space-y-2 flex-none">
          {present.entities.map((ent) => {
            const isCollapsed = !!collapsedGroups[ent.name];
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
                  <span>{ent.name}</span>
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
                            className={`w-[42px] flex-none text-center font-semibold text-[9.5px] rounded-[4px] py-[2px] uppercase ${
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

        {/* Right Request / Response Runner */}
        <div className="flex-1 overflow-y-auto p-7">
          {targetEntity ? (
            <div className="max-w-3xl space-y-5">
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-[6px] font-mono text-[11px] font-semibold uppercase ${
                    VERB_PILL_STYLES[activeMeta.verb]
                  }`}
                >
                  {activeMeta.verb}
                </span>
                <span className="font-mono text-[16px] font-semibold text-[#e8e8ee]">
                  {activeMeta.path}
                </span>
              </div>

              <p className="text-[12.5px] text-[#8a8b9a]">{activeMeta.desc}</p>

              {needsIdParam && (
                <div>
                  <label className="block text-[11.5px] text-[#8a8b9a] mb-2">
                    id (path parameter)
                  </label>
                  <input
                    type="text"
                    value={pathIdParam}
                    onChange={(e) => setPathIdParam(e.target.value)}
                    placeholder="Enter record UUID…"
                    className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-[8px] px-3.5 py-2.5 font-mono text-[12.5px] text-[#e8e8ee] outline-none"
                  />
                </div>
              )}

              {needsBody && (
                <div>
                  <label className="block text-[11.5px] text-[#8a8b9a] mb-2">
                    Request body
                  </label>
                  <textarea
                    value={requestBodyText}
                    onChange={(e) => setRequestBodyText(e.target.value)}
                    spellCheck={false}
                    className="w-64 min-w-[260px] min-h-[128px] bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-[8px] p-3 font-mono text-[12px] leading-[1.55] text-[#e8e8ee] outline-none resize"
                  />
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={handleExecute}
                  className="px-5 py-2 rounded-[8px] text-[13px] font-semibold text-[#1a1206] bg-gradient-to-br from-[#e08a3c] to-[#c9692a] hover:brightness-110 cursor-pointer transition-all"
                >
                  Execute
                </button>
              </div>

              {responseState && (
                <div className="border border-white/[0.09] rounded-xl bg-[#101219] overflow-hidden mt-6">
                  <div className="px-4 py-2.5 border-b border-white/[0.08] bg-[#14161d]/60 flex items-center gap-3 font-mono text-[11.5px]">
                    <span
                      className={`px-2 py-0.5 rounded font-semibold ${
                        responseState.status >= 200 && responseState.status < 300
                          ? 'bg-[#8fbf6b]/15 text-[#8fbf6b]'
                          : 'bg-[#e0708f]/15 text-[#e0708f]'
                      }`}
                    >
                      {responseState.status}
                    </span>
                    <span className="text-[#565766]">{responseState.timeMs}ms</span>
                  </div>
                  <pre className="p-4 font-mono text-[12px] leading-[1.65] text-[#e8e8ee] max-h-[380px] overflow-auto select-text">
                    {responseState.body}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="text-[13px] text-[#565766] font-mono">
              Add a table on the canvas to simulate REST endpoints.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
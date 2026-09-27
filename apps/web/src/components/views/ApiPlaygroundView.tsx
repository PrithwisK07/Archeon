import { useState, useEffect, useMemo } from 'react';
import { useArchitectureStore } from '../../store/architectureStore';
import { SeedEngine, isFieldPk } from '../../lib/seedEngine';
import {
  ActiveReqTab,
  BodyMode,
  EndpointSelection,
  KeyValueField,
  PlaygroundResponseState,
  QueryParamRow,
  VERB_PILL_STYLES,
  getEndpointMeta,
} from './playground/playgroundTypes';
import {
  buildSamplePayloadForEntity,
  executePlaygroundRequest,
  parseJsonToKv,
  serializeKvToJson,
} from './playground/playgroundExecutor';
import { PlaygroundSidebar } from './playground/PlaygroundSidebar';
import { PlaygroundParamsTab } from './playground/PlaygroundParamsTab';
import { PlaygroundBodyTab } from './playground/PlaygroundBodyTab';
import { PlaygroundResponsePanel } from './playground/PlaygroundResponsePanel';

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

  const [activeTab, setActiveTab] = useState<ActiveReqTab>('params');
  const [bodyMode, setBodyMode] = useState<BodyMode>('table');

  const [pathIdParam, setPathIdParam] = useState<string>('');
  const [queryParams, setQueryParams] = useState<QueryParamRow[]>([
    { id: 'qp_1', enabled: false, key: '', value: '' },
  ]);

  const [kvFields, setKvFields] = useState<KeyValueField[]>([]);
  const [requestBodyText, setRequestBodyText] = useState<string>('{\n  \n}');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [responseState, setResponseState] = useState<PlaygroundResponseState | null>(null);

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
      setSelectedEp({ entityName: present.entities[0].name, methodType: 'GET_LIST' });
    }
  }, [present.entities, targetEntity]);

  const resetSamplePayload = () => {
    if (!targetEntity) return;
    const { kvFields: nextKv, jsonText } = buildSamplePayloadForEntity(
      present,
      targetEntity,
      resolvedRelations,
      selectedEp.methodType
    );
    setKvFields(nextKv);
    setRequestBodyText(jsonText);
    setJsonError(null);
  };

  useEffect(() => {
    setResponseState(null);
    if (!targetEntity) return;

    const firstRow = targetEntity.seedData?.[0];
    const firstId = firstRow?.[pkFieldName] ?? firstRow?.id;
    setPathIdParam(firstId !== undefined ? String(firstId) : '');

    const needsBody =
      selectedEp.methodType === 'POST' || selectedEp.methodType === 'PUT';
    setActiveTab(needsBody ? 'body' : 'params');
    if (needsBody) resetSamplePayload();
  }, [selectedEp.entityName, selectedEp.methodType, targetEntity?.name]);

  const handleSyncKvToJson = (updatedKv: KeyValueField[]) => {
    setKvFields(updatedKv);
    setRequestBodyText(serializeKvToJson(updatedKv, targetEntity));
    setJsonError(null);
  };

  const handleRawJsonChange = (raw: string) => {
    setRequestBodyText(raw);
    try {
      const nextKv = parseJsonToKv(raw, present, targetEntity, resolvedRelations);
      setJsonError(null);
      if (nextKv) setKvFields(nextKv);
    } catch (err: any) {
      setJsonError(err.message);
    }
  };

  const handleExecute = () => {
    if (!targetEntity) return;
    const res = executePlaygroundRequest({
      present,
      targetEntity,
      methodType: selectedEp.methodType,
      pkFieldName,
      pathIdParam,
      queryParams,
      requestBodyText,
      addTableRow,
      setEntitySeedData,
      applyAIPatch,
      showToast,
    });
    setResponseState(res);
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
    if (needsIdParam) return `${base}/${pathIdParam.trim() || ':id'}`;
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-[#8a8b9a]">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Schema Visualizer
        </button>
        <span className="text-[10px] font-mono px-2.5 py-1 rounded-full uppercase tracking-[0.4px] text-[#3fc6d8] bg-[#3fc6d8]/14 font-semibold">
          REST Client
        </span>
        <span className="font-mono text-[15px] font-semibold text-[#e8e8ee]">API Playground</span>
        <span className="text-[12px] text-[#565766] ml-1">
          Live constraint-checked execution against your seeded tables
        </span>
      </div>

      {/* Main Split Body */}
      <div className="flex-1 flex overflow-hidden">
        <PlaygroundSidebar
          entities={present.entities}
          selectedEp={selectedEp}
          onSelectEndpoint={setSelectedEp}
        />

        <div className="flex-1 overflow-y-auto p-6">
          {targetEntity ? (
            <div className="max-w-4xl space-y-5">
              {/* URL Bar + Send Button */}
              <div className="flex items-center gap-2.5">
                <div className="flex-1 flex items-center bg-[#101219] border border-white/[0.1] rounded-[10px] p-1.5 gap-2.5">
                  <span className={`px-3 py-1.5 rounded-[7px] font-mono text-[11px] font-semibold uppercase border ${VERB_PILL_STYLES[activeMeta.verb]}`}>
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

              {/* Request Tabs */}
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
                    {needsIdParam && <span className="w-1.5 h-1.5 rounded-full bg-[#e08a3c]" />}
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

                {activeTab === 'params' && (
                  <PlaygroundParamsTab
                    targetEntity={targetEntity}
                    methodType={selectedEp.methodType}
                    needsIdParam={needsIdParam}
                    pkFieldName={pkFieldName}
                    pathIdParam={pathIdParam}
                    onChangePathId={setPathIdParam}
                    existingIds={existingIds}
                    queryParams={queryParams}
                    onChangeQueryParams={setQueryParams}
                    onSwitchToBody={() => setActiveTab('body')}
                  />
                )}

                {activeTab === 'body' && needsBody && (
                  <PlaygroundBodyTab
                    bodyMode={bodyMode}
                    onChangeBodyMode={setBodyMode}
                    kvFields={kvFields}
                    onSyncKvToJson={handleSyncKvToJson}
                    requestBodyText={requestBodyText}
                    onRawJsonChange={handleRawJsonChange}
                    jsonError={jsonError}
                    onPrettifyJson={() => {
                      try {
                        setRequestBodyText(JSON.stringify(JSON.parse(requestBodyText), null, 2));
                        setJsonError(null);
                      } catch (e: any) {
                        setJsonError(e.message);
                      }
                    }}
                    onResetSample={resetSamplePayload}
                  />
                )}
              </div>

              <PlaygroundResponsePanel
                responseState={responseState}
                onCopyJson={() => {
                  if (responseState) {
                    navigator.clipboard.writeText(responseState.body);
                    showToast('Response JSON copied');
                  }
                }}
              />
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
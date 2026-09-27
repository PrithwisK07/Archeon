import type { Entity } from '@zero-dollar/ir-core';
import { EndpointMethod, QueryParamRow } from './playgroundTypes';

interface PlaygroundParamsTabProps {
  targetEntity: Entity;
  methodType: EndpointMethod;
  needsIdParam: boolean;
  pkFieldName: string;
  pathIdParam: string;
  onChangePathId: (val: string) => void;
  existingIds: string[];
  queryParams: QueryParamRow[];
  onChangeQueryParams: React.Dispatch<React.SetStateAction<QueryParamRow[]>>;
  onSwitchToBody: () => void;
}

export function PlaygroundParamsTab({
  targetEntity,
  methodType,
  needsIdParam,
  pkFieldName,
  pathIdParam,
  onChangePathId,
  existingIds,
  queryParams,
  onChangeQueryParams,
  onSwitchToBody,
}: PlaygroundParamsTabProps) {
  return (
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
                      onChange={(e) => onChangePathId(e.target.value)}
                      placeholder={`Enter ${pkFieldName}…`}
                      className="w-full bg-[#0b0c10] border border-white/[0.09] focus:border-[#e08a3c]/60 rounded px-2.5 py-1.5 text-[#e8e8ee] outline-none"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <select
                      value={existingIds.includes(pathIdParam) ? pathIdParam : ''}
                      onChange={(e) => {
                        if (e.target.value) onChangePathId(e.target.value);
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

      {methodType === 'GET_LIST' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#8a8b9a]">
              Query Parameters (Filter Records)
            </span>
            <button
              type="button"
              onClick={() =>
                onChangeQueryParams((prev) => [
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
                          onChangeQueryParams((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, enabled: e.target.checked } : item
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
                          onChangeQueryParams((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, key: e.target.value, enabled: true }
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
                          onChangeQueryParams((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, value: e.target.value, enabled: true }
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
                            onChangeQueryParams((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                          className="text-[#565766] hover:text-[#e0708f] cursor-pointer"
                        >
                          ✕
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

      {!needsIdParam && methodType !== 'GET_LIST' && (
        <div className="text-[12px] text-[#565766] font-mono py-2">
          No path or query parameters required for this endpoint. Switch to the{' '}
          <button
            type="button"
            onClick={onSwitchToBody}
            className="text-[#e08a3c] underline cursor-pointer"
          >
            Body
          </button>{' '}
          tab to configure the request payload.
        </div>
      )}
    </div>
  );
}
import type { Field } from '@zero-dollar/ir-core';
import { BodyMode, KeyValueField } from './playgroundTypes';

interface PlaygroundBodyTabProps {
  bodyMode: BodyMode;
  onChangeBodyMode: (mode: BodyMode) => void;
  kvFields: KeyValueField[];
  onSyncKvToJson: (nextKv: KeyValueField[]) => void;
  requestBodyText: string;
  onRawJsonChange: (raw: string) => void;
  jsonError: string | null;
  onPrettifyJson: () => void;
  onResetSample: () => void;
}

export function PlaygroundBodyTab({
  bodyMode,
  onChangeBodyMode,
  kvFields,
  onSyncKvToJson,
  requestBodyText,
  onRawJsonChange,
  jsonError,
  onPrettifyJson,
  onResetSample,
}: PlaygroundBodyTabProps) {
  return (
    <div className="p-4 space-y-3">
      {/* Body Format Switcher */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 bg-[#0b0c10] p-1 rounded-lg border border-white/[0.08]">
          <button
            type="button"
            onClick={() => onChangeBodyMode('table')}
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
            onClick={() => onChangeBodyMode('json')}
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
                onSyncKvToJson([
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
              onClick={onPrettifyJson}
              className="px-2.5 py-1 rounded border border-white/[0.09] bg-white/[0.03] hover:bg-white/[0.07] text-[11.5px] font-mono text-[#3fc6d8] cursor-pointer"
            >
              Prettify JSON
            </button>
          )}

          <button
            type="button"
            onClick={onResetSample}
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
                          i === idx ? { ...row, enabled: e.target.checked } : row
                        );
                        onSyncKvToJson(next);
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
                        onSyncKvToJson(next);
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
                              ? { ...row, type: e.target.value as Field['type'] }
                              : row
                          );
                          onSyncKvToJson(next);
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
                            i === idx ? { ...row, value: e.target.value } : row
                          );
                          onSyncKvToJson(next);
                        }}
                        placeholder="Value…"
                        className="flex-1 bg-[#0b0c10] border border-white/[0.08] focus:border-[#e08a3c]/60 rounded px-2.5 py-1.5 text-[#e8e8ee] outline-none"
                      />

                      {item.fkInfo && item.fkInfo.options.length > 0 && (
                        <select
                          value={
                            item.fkInfo.options.includes(item.value) ? item.value : ''
                          }
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const next = kvFields.map((row, i) =>
                              i === idx ? { ...row, value: e.target.value } : row
                            );
                            onSyncKvToJson(next);
                          }}
                          className="w-40 bg-[#0b0c10] border border-white/[0.08] rounded px-2 py-1.5 text-[#3fc6d8] text-[11px] outline-none cursor-pointer"
                        >
                          <option value="">
                            Pick {item.fkInfo.parentEntity} ID…
                          </option>
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
                        onSyncKvToJson(kvFields.filter((_, i) => i !== idx))
                      }
                      className="text-[#565766] hover:text-[#e0708f] cursor-pointer"
                    >
                      ✕
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
            onChange={(e) => onRawJsonChange(e.target.value)}
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
  );
}
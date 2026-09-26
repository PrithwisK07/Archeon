import { useState, useRef, useEffect } from 'react';
import { useArchitectureStore } from '../../store/architectureStore';
import type { Field } from '@zero-dollar/ir-core';

interface ChatConsoleProps {
  onSumbit: (prompt: string) => Promise<void>;
  isThinking: boolean;
}

const PG_TYPE_OPTIONS: { label: string; irType: Field['type'] }[] = [
  { label: 'uuid', irType: 'uuid' },
  { label: 'text', irType: 'string' },
  { label: 'numeric', irType: 'number' },
  { label: 'boolean', irType: 'boolean' },
  { label: 'timestamptz', irType: 'datetime' },
  { label: 'jsonb', irType: 'json' },
];

export function ChatConsole({ onSumbit, isThinking }: ChatConsoleProps) {
  const [input, setInput] = useState('');
  const {
    present,
    chatHistory,
    isCopilotOpen,
    setIsCopilotOpen,
    inspectorTarget,
    closeInspector,
    dispatchManualAction,
    showToast,
  } = useArchitectureStore();

  const copilotBodyRef = useRef<HTMLDivElement>(null);

  // Scroll only the internal chat container vertically — never scrollIntoView() on the viewport!
  useEffect(() => {
    if (isCopilotOpen && copilotBodyRef.current) {
      copilotBodyRef.current.scrollTo({
        top: copilotBodyRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [chatHistory, isCopilotOpen, isThinking]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;
    setInput('');
    onSumbit(trimmed);
  };

  // Resolve currently inspected entity & field
  const inspectedEntity = inspectorTarget
    ? present.entities.find((e) => e.name === inspectorTarget.entityName)
    : null;
  const inspectedField =
    inspectedEntity && inspectorTarget
      ? inspectedEntity.fields.find((f) => f.name === inspectorTarget.fieldName)
      : null;

  const isInspectorOpen = Boolean(inspectorTarget && inspectedField);

  const [localFieldName, setLocalFieldName] = useState('');
  const [localDefaultVal, setLocalDefaultVal] = useState('');

  useEffect(() => {
    if (inspectedField) {
      setLocalFieldName(inspectedField.name);
      setLocalDefaultVal(
        inspectedField.defaultValue !== undefined && inspectedField.defaultValue !== null
          ? String(inspectedField.defaultValue)
          : ''
      );
    }
  }, [inspectedField]);

  const commitFieldRename = () => {
    if (!inspectorTarget || !inspectedField) return;
    const clean = localFieldName.trim().replace(/[^a-zA-Z0-9_]/g, '_');
    if (clean && clean !== inspectedField.name) {
      dispatchManualAction({
        action: 'UPDATE_FIELD',
        targetEntity: inspectorTarget.entityName,
        targetField: inspectedField.name,
        payload: { name: clean },
      });
    } else {
      setLocalFieldName(inspectedField.name);
    }
  };

  const commitDefaultValue = () => {
    if (!inspectorTarget || !inspectedField) return;
    const trimmed = localDefaultVal.trim();
    dispatchManualAction({
      action: 'UPDATE_FIELD',
      targetEntity: inspectorTarget.entityName,
      targetField: inspectedField.name,
      payload: { defaultValue: trimmed === '' ? undefined : trimmed },
    });
  };

  const tableCount = present.entities.length;
  const relationCount = present.relations.length;
  const statusFieldCandidate = present.entities
    .flatMap((e) => e.fields.map((f) => ({ entity: e.name, field: f })))
    .find(
      (item) =>
        (item.field.name === 'status' || item.field.name === 'role') &&
        item.field.defaultValue === undefined
    );

  return (
    <>
      {/* ================= COPILOT DRAWER ================= */}
      <div
        className={`absolute top-0 right-0 w-[320px] h-full z-30 bg-[#14161d] border-l border-white/[0.09] flex flex-col transition-transform duration-250 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          isCopilotOpen
            ? 'translate-x-0 pointer-events-auto'
            : 'translate-x-full pointer-events-none'
        }`}
      >
        {/* Copilot Header */}
        <div className="px-4 py-3.5 border-b border-white/[0.09] flex items-center gap-[9px]">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="w-4 h-4 text-[#8b7ff0]"
          >
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
            <circle cx="12" cy="12" r="3.5" />
          </svg>
          <b className="text-[13px] font-semibold">Copilot</b>
          <span className="text-[11px] text-[#565766] ml-auto">
            {isThinking ? 'synthesizing patch…' : 'watching your graph'}
          </span>
          <button
            type="button"
            onClick={() => setIsCopilotOpen(false)}
            className="w-6 h-6 rounded-full text-[#8a8b9a] hover:text-[#e8e8ee] hover:bg-white/[0.05] flex items-center justify-center text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Copilot Messages Body */}
        <div
          ref={copilotBodyRef}
          className="flex-1 overflow-y-auto px-4 py-3.5 flex flex-col gap-3"
        >
          {/* Live Graph Status Card */}
          <div className="text-[12.5px] leading-[1.5] max-w-[92%] px-[11px] py-[9px] rounded-[10px] bg-[#8b7ff0]/10 border border-[#8b7ff0]/20 self-start">
            <b className="text-[#8b7ff0]">Copilot</b>
            <br />
            Scanned schema.graph — {tableCount} {tableCount === 1 ? 'table' : 'tables'},{' '}
            {relationCount} {relationCount === 1 ? 'relationship' : 'relationships'}, no cycles
            detected.
          </div>

          {statusFieldCandidate && (
            <div className="text-[12.5px] leading-[1.5] max-w-[92%] px-[11px] py-[9px] rounded-[10px] bg-[#e08a3c]/[0.08] border border-[#e08a3c]/25 self-start">
              <b className="text-[#e08a3c]">Heads up</b>
              <br />
              <code className="font-mono text-[11.5px]">
                {statusFieldCandidate.entity}.{statusFieldCandidate.field.name}
              </code>{' '}
              has no default constraint. Ask me to set a default or constrain it!
            </div>
          )}

          {/* User & AI Conversation History */}
          {chatHistory.map((msg) => (
            <div
              key={msg.id}
              className={`text-[12.5px] leading-[1.5] max-w-[92%] px-[11px] py-[9px] rounded-[10px] break-words ${
                msg.role === 'user'
                  ? 'bg-white/[0.045] border border-white/[0.09] self-end text-[#e8e8ee]'
                  : msg.role === 'warn'
                  ? 'bg-[#e08a3c]/[0.08] border border-[#e08a3c]/25 self-start'
                  : 'bg-[#8b7ff0]/10 border border-[#8b7ff0]/20 self-start'
              }`}
            >
              {msg.role !== 'user' && (
                <>
                  <b className={msg.role === 'warn' ? 'text-[#e08a3c]' : 'text-[#8b7ff0]'}>
                    {msg.role === 'warn' ? 'Heads up' : 'Copilot'}
                  </b>
                  <br />
                </>
              )}
              {msg.content}
            </div>
          ))}

          {isThinking && (
            <div className="text-[12.5px] leading-[1.5] max-w-[92%] px-[11px] py-[9px] rounded-[10px] bg-[#8b7ff0]/10 border border-[#8b7ff0]/20 self-start flex items-center gap-2 text-[#8a8b9a]">
              <div className="w-3 h-3 border-2 border-[#8b7ff0] border-t-transparent rounded-full animate-spin" />
              Applying topological changes…
            </div>
          )}
        </div>

        {/* Copilot Input Bar */}
        <div className="border-t border-white/[0.09] p-2.5 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isThinking}
            placeholder="Ask copilot to change the schema…"
            className="flex-1 bg-[#101219] border border-white/[0.09] focus:border-[#8b7ff0]/50 rounded-lg px-2.5 py-[9px] text-[#e8e8ee] text-[12.5px] outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            className="w-[34px] rounded-lg bg-[#8b7ff0] hover:brightness-110 disabled:opacity-40 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0e0a1f"
              strokeWidth="2"
              className="w-[15px] h-[15px]"
            >
              <path d="M4 12l16-7-6 16-2-7-8-2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* ================= FIELD INSPECTOR DRAWER ================= */}
      <div
        className={`absolute top-0 right-0 w-[320px] h-full z-40 bg-[#14161d] border-l border-white/[0.09] flex flex-col transition-transform duration-250 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          isInspectorOpen
            ? 'translate-x-0 pointer-events-auto'
            : 'translate-x-full pointer-events-none'
        }`}
      >
        <div className="px-4 py-3.5 border-b border-white/[0.09] flex items-center gap-[9px]">
          <b className="text-[13px] font-semibold">Edit field</b>
          <span className="text-[11px] text-[#565766] font-mono ml-auto mr-1.5 truncate max-w-[140px]">
            {inspectorTarget ? `${inspectorTarget.entityName}.${inspectorTarget.fieldName}` : ''}
          </span>
          <button
            type="button"
            onClick={closeInspector}
            className="w-[26px] h-[26px] rounded-full bg-white/[0.045] border border-white/[0.09] hover:border-white/20 flex items-center justify-center text-[#8a8b9a] hover:text-[#e8e8ee] cursor-pointer"
          >
            ✕
          </button>
        </div>

        {inspectorTarget && inspectedField && (
          <div className="flex-1 overflow-y-auto p-4">
            {/* Field Name */}
            <div className="mb-4">
              <label className="block text-[11px] text-[#8a8b9a] mb-1.5">Name</label>
              <input
                type="text"
                value={localFieldName}
                onChange={(e) => setLocalFieldName(e.target.value)}
                onBlur={commitFieldRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitFieldRename();
                }}
                className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-lg px-2.5 py-[9px] text-[#e8e8ee] text-[12.5px] font-mono outline-none"
              />
            </div>

            {/* Field Type */}
            <div className="mb-4">
              <label className="block text-[11px] text-[#8a8b9a] mb-1.5">Type</label>
              <select
                value={inspectedField.type}
                onChange={(e) =>
                  dispatchManualAction({
                    action: 'UPDATE_FIELD',
                    targetEntity: inspectorTarget.entityName,
                    targetField: inspectedField.name,
                    payload: { type: e.target.value as Field['type'] },
                  })
                }
                className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-lg px-2.5 py-[9px] text-[#e8e8ee] text-[12.5px] font-mono outline-none"
              >
                {PG_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.irType} value={opt.irType} className="bg-[#14161d]">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Primary Key Switch */}
            <div className="flex items-center justify-between py-[9px] text-[12.5px] border-b border-white/[0.05]">
              <span>Primary key</span>
              <button
                type="button"
                role="switch"
                aria-checked={!!inspectedField.isPrimaryKey || inspectedField.name === 'id'}
                onClick={() =>
                  dispatchManualAction({
                    action: 'UPDATE_FIELD',
                    targetEntity: inspectorTarget.entityName,
                    targetField: inspectedField.name,
                    payload: {
                      isPrimaryKey: !(inspectedField.isPrimaryKey || inspectedField.name === 'id'),
                    },
                  })
                }
                className={`relative w-[34px] h-[19px] rounded-full transition-colors cursor-pointer ${
                  inspectedField.isPrimaryKey || inspectedField.name === 'id'
                    ? 'bg-[#e08a3c]'
                    : 'bg-white/[0.14]'
                }`}
              >
                <span
                  className={`absolute top-[2px] left-[2px] w-[15px] h-[15px] rounded-full bg-[#e8e8ee] transition-transform ${
                    inspectedField.isPrimaryKey || inspectedField.name === 'id'
                      ? 'translate-x-[15px]'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Nullable Switch */}
            <div className="flex items-center justify-between py-[9px] text-[12.5px] border-b border-white/[0.05]">
              <span>Nullable</span>
              <button
                type="button"
                role="switch"
                aria-checked={!!inspectedField.nullable}
                onClick={() =>
                  dispatchManualAction({
                    action: 'UPDATE_FIELD',
                    targetEntity: inspectorTarget.entityName,
                    targetField: inspectedField.name,
                    payload: { nullable: !inspectedField.nullable },
                  })
                }
                className={`relative w-[34px] h-[19px] rounded-full transition-colors cursor-pointer ${
                  inspectedField.nullable ? 'bg-[#e08a3c]' : 'bg-white/[0.14]'
                }`}
              >
                <span
                  className={`absolute top-[2px] left-[2px] w-[15px] h-[15px] rounded-full bg-[#e8e8ee] transition-transform ${
                    inspectedField.nullable ? 'translate-x-[15px]' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Unique Switch */}
            <div className="flex items-center justify-between py-[9px] text-[12.5px] border-b border-white/[0.05]">
              <span>Unique</span>
              <button
                type="button"
                role="switch"
                aria-checked={!!inspectedField.unique}
                onClick={() =>
                  dispatchManualAction({
                    action: 'UPDATE_FIELD',
                    targetEntity: inspectorTarget.entityName,
                    targetField: inspectedField.name,
                    payload: { unique: !inspectedField.unique },
                  })
                }
                className={`relative w-[34px] h-[19px] rounded-full transition-colors cursor-pointer ${
                  inspectedField.unique ? 'bg-[#e08a3c]' : 'bg-white/[0.14]'
                }`}
              >
                <span
                  className={`absolute top-[2px] left-[2px] w-[15px] h-[15px] rounded-full bg-[#e8e8ee] transition-transform ${
                    inspectedField.unique ? 'translate-x-[15px]' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Default Value */}
            <div className="mt-3.5 mb-4">
              <label className="block text-[11px] text-[#8a8b9a] mb-1.5">Default value</label>
              <input
                type="text"
                value={localDefaultVal}
                onChange={(e) => setLocalDefaultVal(e.target.value)}
                onBlur={commitDefaultValue}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitDefaultValue();
                }}
                placeholder="e.g. now()"
                className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-lg px-2.5 py-[9px] text-[#e8e8ee] text-[12.5px] font-mono outline-none"
              />
            </div>

            {/* Delete Field Button */}
            <button
              type="button"
              onClick={() => {
                dispatchManualAction({
                  action: 'REMOVE_FIELD',
                  targetEntity: inspectorTarget.entityName,
                  targetField: inspectedField.name,
                });
                closeInspector();
                showToast('Field removed');
              }}
              className="w-full mt-2 bg-[#e0708f]/10 hover:bg-[#e0708f]/18 border border-[#e0708f]/30 text-[#e0708f] p-[9px] rounded-lg text-[12.5px] transition-colors cursor-pointer"
            >
              Delete field
            </button>
          </div>
        )}
      </div>
    </>
  );
}
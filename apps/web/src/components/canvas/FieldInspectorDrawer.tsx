import { useState, useEffect } from 'react';
import { useArchitectureStore } from '../../store/architectureStore';
import type { Field } from '@zero-dollar/ir-core';

const PG_TYPE_OPTIONS: { label: string; irType: Field['type'] }[] = [
  { label: 'uuid', irType: 'uuid' },
  { label: 'text', irType: 'string' },
  { label: 'numeric', irType: 'number' },
  { label: 'boolean', irType: 'boolean' },
  { label: 'timestamptz', irType: 'datetime' },
  { label: 'jsonb', irType: 'json' },
];

export function FieldInspectorDrawer() {
  const {
    present,
    inspectorTarget,
    closeInspector,
    dispatchManualAction,
    showToast,
  } = useArchitectureStore();

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

  const renderToggleRow = (
    label: string,
    checked: boolean,
    onToggle: (next: boolean) => void
  ) => (
    <div className="flex items-center justify-between py-[9px] text-[12.5px] border-b border-white/[0.05]">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onToggle(!checked)}
        className={`relative w-[34px] h-[19px] rounded-full transition-colors cursor-pointer ${
          checked ? 'bg-[#e08a3c]' : 'bg-white/[0.14]'
        }`}
      >
        <span
          className={`absolute top-[2px] left-[2px] w-[15px] h-[15px] rounded-full bg-[#e8e8ee] transition-transform ${
            checked ? 'translate-x-[15px]' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );

  return (
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

          {renderToggleRow(
            'Primary key',
            Boolean(inspectedField.isPrimaryKey ?? inspectedField.name === 'id'),
            (next) =>
              dispatchManualAction({
                action: 'UPDATE_FIELD',
                targetEntity: inspectorTarget.entityName,
                targetField: inspectedField.name,
                payload: { isPrimaryKey: next },
              })
          )}

          {renderToggleRow('Nullable', Boolean(inspectedField.nullable), (next) =>
            dispatchManualAction({
              action: 'UPDATE_FIELD',
              targetEntity: inspectorTarget.entityName,
              targetField: inspectedField.name,
              payload: { nullable: next },
            })
          )}

          {renderToggleRow('Unique', Boolean(inspectedField.unique), (next) =>
            dispatchManualAction({
              action: 'UPDATE_FIELD',
              targetEntity: inspectorTarget.entityName,
              targetField: inspectedField.name,
              payload: { unique: next },
            })
          )}

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
  );
}
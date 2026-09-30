import { useState, useEffect } from 'react';
import type { Field, Entity } from '@zero-dollar/ir-core';
import { useArchitectureStore } from '../../../store/architectureStore';
import { SeedEngine } from '../../../lib/seedEngine';

const PG_TYPE_OPTIONS: { label: string; irType: Field['type'] }[] = [
  { label: 'uuid', irType: 'uuid' },
  { label: 'text', irType: 'string' },
  { label: 'numeric', irType: 'number' },
  { label: 'boolean', irType: 'boolean' },
  { label: 'timestamptz', irType: 'datetime' },
  { label: 'jsonb', irType: 'json' },
];

export function FieldProperties({ entity, field }: { entity: Entity; field: Field }) {
  const { dispatchManualAction, closeInspector, showToast } = useArchitectureStore();
  const [localFieldName, setLocalFieldName] = useState(field.name);
  const [localDefaultVal, setLocalDefaultVal] = useState(
    field.defaultValue !== undefined && field.defaultValue !== null ? String(field.defaultValue) : ''
  );

  useEffect(() => {
    setLocalFieldName(field.name);
    setLocalDefaultVal(field.defaultValue !== undefined && field.defaultValue !== null ? String(field.defaultValue) : '');
  }, [field]);

  const commitFieldRename = () => {
    const clean = localFieldName.trim().replace(/[^a-zA-Z0-9_]/g, '_');
    if (clean && clean !== field.name) {
      dispatchManualAction({
        action: 'UPDATE_FIELD',
        targetEntity: entity.name,
        targetField: field.name,
        payload: { name: clean },
      });
    } else {
      setLocalFieldName(field.name);
    }
  };

  const commitDefaultValue = () => {
    const trimmed = localDefaultVal.trim();
    dispatchManualAction({
      action: 'UPDATE_FIELD',
      targetEntity: entity.name,
      targetField: field.name,
      payload: { defaultValue: trimmed === '' ? undefined : trimmed },
    });
  };

  const renderToggleRow = (label: string, checked: boolean, onToggle: (n: boolean) => void, disabled = false, hint?: string) => (
    <div className="flex items-center justify-between py-[9px] text-[12.5px] border-b border-white/[0.05]">
      <div className="flex flex-col">
        <span className={disabled ? 'text-[#565766]' : ''}>{label}</span>
        {hint && <span className="text-[10px] font-mono text-[#565766]">{hint}</span>}
      </div>
      <button
        type="button"
        role="switch"
        disabled={disabled}
        aria-checked={checked}
        onClick={() => !disabled && onToggle(!checked)}
        className={`relative w-[34px] h-[19px] rounded-full transition-colors ${
          disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
        } ${checked ? 'bg-[#e08a3c]' : 'bg-white/[0.14]'}`}
      >
        <span className={`absolute top-[2px] left-[2px] w-[15px] h-[15px] rounded-full bg-[#e8e8ee] transition-transform ${checked ? 'translate-x-[15px]' : 'translate-x-0'}`} />
      </button>
    </div>
  );

  const isFieldPk = Boolean(field.isPrimaryKey ?? field.name === 'id');
  const entityPkFields = SeedEngine.getEntityPkFields(entity);

  return (
    <>
      <div className="mb-4">
        <label className="block text-[11px] text-[#8a8b9a] mb-1.5">Name</label>
        <input
          type="text"
          value={localFieldName}
          onChange={(e) => setLocalFieldName(e.target.value)}
          onBlur={commitFieldRename}
          onKeyDown={(e) => e.key === 'Enter' && commitFieldRename()}
          className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-lg px-2.5 py-[9px] text-[#e8e8ee] text-[12.5px] font-mono outline-none"
        />
      </div>

      <div className="mb-4">
        <label className="block text-[11px] text-[#8a8b9a] mb-1.5">Type</label>
        <select
          value={field.type}
          onChange={(e) => dispatchManualAction({ action: 'UPDATE_FIELD', targetEntity: entity.name, targetField: field.name, payload: { type: e.target.value as Field['type'] } })}
          className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-lg px-2.5 py-[9px] text-[#e8e8ee] text-[12.5px] font-mono outline-none"
        >
          {PG_TYPE_OPTIONS.map((opt) => (
            <option key={opt.irType} value={opt.irType} className="bg-[#14161d]">{opt.label}</option>
          ))}
        </select>
      </div>

      {renderToggleRow('Primary key', isFieldPk, (next) => dispatchManualAction({ action: 'UPDATE_FIELD', targetEntity: entity.name, targetField: field.name, payload: { isPrimaryKey: next } }), false, entityPkFields.length > 1 ? `Composite PK: (${entityPkFields.join(', ')})` : undefined)}
      {renderToggleRow('Nullable', isFieldPk ? false : Boolean(field.nullable), (next) => dispatchManualAction({ action: 'UPDATE_FIELD', targetEntity: entity.name, targetField: field.name, payload: { nullable: next } }), isFieldPk, isFieldPk ? 'Primary keys cannot be nullable' : undefined)}
      {renderToggleRow('Unique', Boolean(field.unique), (next) => dispatchManualAction({ action: 'UPDATE_FIELD', targetEntity: entity.name, targetField: field.name, payload: { unique: next } }))}

      <div className="mt-3.5 mb-4">
        <label className="block text-[11px] text-[#8a8b9a] mb-1.5">Default value</label>
        <input
          type="text"
          value={localDefaultVal}
          onChange={(e) => setLocalDefaultVal(e.target.value)}
          onBlur={commitDefaultValue}
          onKeyDown={(e) => e.key === 'Enter' && commitDefaultValue()}
          placeholder="e.g. now()"
          className="w-full bg-[#101219] border border-white/[0.09] focus:border-[#e08a3c]/50 rounded-lg px-2.5 py-[9px] text-[#e8e8ee] text-[12.5px] font-mono outline-none"
        />
      </div>

      <button
        type="button"
        onClick={() => {
          dispatchManualAction({ action: 'REMOVE_FIELD', targetEntity: entity.name, targetField: field.name });
          closeInspector();
          showToast('Field removed');
        }}
        className="w-full mt-1 bg-[#e0708f]/10 hover:bg-[#e0708f]/18 border border-[#e0708f]/30 text-[#e0708f] p-[9px] rounded-lg text-[12.5px] transition-colors cursor-pointer"
      >
        Delete field
      </button>
    </>
  );
}
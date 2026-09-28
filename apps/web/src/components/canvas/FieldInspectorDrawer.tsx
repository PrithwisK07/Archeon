import { useState, useEffect } from 'react';
import { useArchitectureStore } from '../../store/architectureStore';
import { SeedEngine } from '../../lib/seedEngine';
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
    updateEntityIndexes,
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
  const [selectedIdxFields, setSelectedIdxFields] = useState<string[]>([]);
  const [newIdxUnique, setNewIdxUnique] = useState(false);

  useEffect(() => {
    if (inspectedField) {
      setLocalFieldName(inspectedField.name);
      setLocalDefaultVal(
        inspectedField.defaultValue !== undefined &&
          inspectedField.defaultValue !== null
          ? String(inspectedField.defaultValue)
          : ''
      );
    }
  }, [inspectedField]);

  useEffect(() => {
    setSelectedIdxFields([]);
    setNewIdxUnique(false);
  }, [inspectorTarget?.entityName]);

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

  const handleAddIndex = () => {
    if (!inspectedEntity || selectedIdxFields.length === 0) return;
    const currentIndexes = inspectedEntity.indexes || [];

    const key = selectedIdxFields.join('|');
    if (currentIndexes.some((idx) => idx.fields.join('|') === key)) {
      showToast('An index on those exact columns already exists');
      return;
    }

    const nextIndexes = [
      ...currentIndexes,
      {
        name: `idx_${inspectedEntity.name.toLowerCase()}_${selectedIdxFields.join('_')}`,
        fields: selectedIdxFields,
        unique: newIdxUnique,
      },
    ];
    updateEntityIndexes(inspectedEntity.name, nextIndexes);
    setSelectedIdxFields([]);
    setNewIdxUnique(false);
  };

  const handleRemoveIndex = (idxToRemove: number) => {
    if (!inspectedEntity) return;
    const nextIndexes = (inspectedEntity.indexes || []).filter(
      (_, i) => i !== idxToRemove
    );
    updateEntityIndexes(inspectedEntity.name, nextIndexes);
  };

  const renderToggleRow = (
    label: string,
    checked: boolean,
    onToggle: (next: boolean) => void,
    disabled = false,
    hint?: string
  ) => (
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
        <span
          className={`absolute top-[2px] left-[2px] w-[15px] h-[15px] rounded-full bg-[#e8e8ee] transition-transform ${
            checked ? 'translate-x-[15px]' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );

  const isFieldPk = Boolean(
    inspectedField && (inspectedField.isPrimaryKey ?? inspectedField.name === 'id')
  );
  const entityPkFields = inspectedEntity
    ? SeedEngine.getEntityPkFields(inspectedEntity)
    : [];

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
          {inspectorTarget
            ? `${inspectorTarget.entityName}.${inspectorTarget.fieldName}`
            : ''}
        </span>
        <button
          type="button"
          onClick={closeInspector}
          className="w-[26px] h-[26px] rounded-full bg-white/[0.045] border border-white/[0.09] hover:border-white/20 flex items-center justify-center text-[#8a8b9a] hover:text-[#e8e8ee] cursor-pointer"
        >
          ✕
        </button>
      </div>

      {inspectorTarget && inspectedEntity && inspectedField && (
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
                <option
                  key={opt.irType}
                  value={opt.irType}
                  className="bg-[#14161d]"
                >
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {renderToggleRow(
            'Primary key',
            isFieldPk,
            (next) =>
              dispatchManualAction({
                action: 'UPDATE_FIELD',
                targetEntity: inspectorTarget.entityName,
                targetField: inspectedField.name,
                payload: { isPrimaryKey: next },
              }),
            false,
            entityPkFields.length > 1
              ? `Composite PK: (${entityPkFields.join(', ')})`
              : undefined
          )}

          {renderToggleRow(
            'Nullable',
            isFieldPk ? false : Boolean(inspectedField.nullable),
            (next) =>
              dispatchManualAction({
                action: 'UPDATE_FIELD',
                targetEntity: inspectorTarget.entityName,
                targetField: inspectedField.name,
                payload: { nullable: next },
              }),
            isFieldPk,
            isFieldPk ? 'Primary keys cannot be nullable' : undefined
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
            <label className="block text-[11px] text-[#8a8b9a] mb-1.5">
              Default value
            </label>
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
            className="w-full mt-1 bg-[#e0708f]/10 hover:bg-[#e0708f]/18 border border-[#e0708f]/30 text-[#e0708f] p-[9px] rounded-lg text-[12.5px] transition-colors cursor-pointer"
          >
            Delete field
          </button>

          {/* Table Indexes & Composite Key Section */}
          <div className="pt-4 mt-5 border-t border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#8a8b9a]">
                Table Indexes ({inspectedEntity.indexes?.length || 0})
              </span>
              {entityPkFields.length > 1 && (
                <span className="text-[10px] font-mono text-[#e08a3c]">
                  @@id([{entityPkFields.join(', ')}])
                </span>
              )}
            </div>

            {(inspectedEntity.indexes || []).length > 0 ? (
              <div className="space-y-1.5">
                {(inspectedEntity.indexes || []).map((idx, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#101219] border border-white/[0.08] font-mono text-[11.5px]"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`text-[9.5px] px-1.5 py-0.5 rounded font-semibold ${
                          idx.unique
                            ? 'bg-[#e08a3c]/15 text-[#e08a3c]'
                            : 'bg-[#8b7ff0]/15 text-[#b5adf2]'
                        }`}
                      >
                        {idx.unique ? '@@unique' : '@@index'}
                      </span>
                      <span className="text-[#e8e8ee] truncate">
                        [{idx.fields.join(', ')}]
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveIndex(i)}
                      className="text-[#565766] hover:text-[#e0708f] ml-2 cursor-pointer"
                      title="Remove index"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[11.5px] text-[#565766] font-mono">
                No secondary indexes on {inspectedEntity.name}.
              </div>
            )}

            {/* Add Single or Composite Index */}
            <div className="p-2.5 rounded-lg bg-[#101219] border border-white/[0.08] space-y-2.5">
              <div className="text-[11px] text-[#8a8b9a]">
                Select column(s) for index:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {inspectedEntity.fields.map((f) => {
                  const active = selectedIdxFields.includes(f.name);
                  return (
                    <button
                      key={f.name}
                      type="button"
                      onClick={() =>
                        setSelectedIdxFields((prev) =>
                          prev.includes(f.name)
                            ? prev.filter((x) => x !== f.name)
                            : [...prev, f.name]
                        )
                      }
                      className={`px-2 py-1 rounded text-[11px] font-mono border cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#e08a3c]/20 border-[#e08a3c] text-[#e08a3c]'
                          : 'bg-[#14161d] border-white/[0.08] text-[#8a8b9a] hover:text-[#e8e8ee]'
                      }`}
                    >
                      {f.name}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-1.5 text-[11.5px] text-[#8a8b9a] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIdxUnique}
                    onChange={(e) => setNewIdxUnique(e.target.checked)}
                    className="accent-[#e08a3c] cursor-pointer"
                  />
                  Unique (@@unique)
                </label>

                <button
                  type="button"
                  disabled={selectedIdxFields.length === 0}
                  onClick={handleAddIndex}
                  className="px-2.5 py-1 rounded bg-[#e08a3c] text-[#1a1206] font-semibold text-[11px] disabled:opacity-40 cursor-pointer"
                >
                  + Add Index
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
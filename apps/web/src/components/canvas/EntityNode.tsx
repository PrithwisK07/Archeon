import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import type { UINodeData } from '../../lib/reactFlowAdapter';
import { useArchitectureStore } from '../../store/architectureStore';
import type { Field } from '@zero-dollar/ir-core';

const DISPLAY_TYPE_LABELS: Record<Field['type'], string> = {
  uuid: 'uuid',
  string: 'text',
  number: 'numeric',
  boolean: 'boolean',
  datetime: 'timestamptz',
  json: 'jsonb',
};

const TYPE_BADGE_STYLES: Record<Field['type'], string> = {
  uuid: 'text-[#8b7ff0] bg-[#8b7ff0]/12',
  string: 'text-[#8a8b9a] bg-white/[0.05]',
  number: 'text-[#e08a3c] bg-[#e08a3c]/12',
  datetime: 'text-[#3fc6d8] bg-[#3fc6d8]/12',
  boolean: 'text-[#8fbf6b] bg-[#8fbf6b]/12',
  json: 'text-[#e0708f] bg-[#e0708f]/12',
};

export const EntityNode = memo(({ data, selected, id }: NodeProps<UINodeData>) => {
  const { entity, colorHex, fkFields } = data;
  const {
    dispatchManualAction,
    present,
    openInspector,
    inspectorTarget,
    closeInspector,
    showToast,
  } = useArchitectureStore();

  const [editingEntity, setEditingEntity] = useState(false);
  const entityInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingEntity) entityInputRef.current?.focus();
  }, [editingEntity]);

  const attachedSnippets =
    present.customSql?.filter((sql) => sql.targetEntity === entity.name) || [];

  const handleAddRow = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextIndex = entity.fields.length + 1;
    let fieldName = `col_${nextIndex}`;
    while (entity.fields.some((f) => f.name === fieldName)) {
      fieldName = `col_${nextIndex}_${Math.floor(Math.random() * 99)}`;
    }
    dispatchManualAction({
      action: 'ADD_FIELD',
      targetEntity: entity.name,
      payload: { name: fieldName, type: 'string', nullable: false, unique: false },
    });
    openInspector(entity.name, fieldName);
  };

  const handleDeleteEntity = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inspectorTarget?.entityName === entity.name) {
      closeInspector();
    }
    dispatchManualAction({
      action: 'REMOVE_ENTITY',
      targetEntity: entity.name,
    });
    showToast('Table deleted');
  };

  const commitEntityName = (
    e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>
  ) => {
    const newName = e.currentTarget.value.trim().replace(/[^a-zA-Z0-9_]/g, '_');
    if (newName && newName !== entity.name) {
      dispatchManualAction({
        action: 'UPDATE_ENTITY',
        targetEntity: entity.name,
        payload: { name: newName },
      });
    }
    setEditingEntity(false);
  };

  const triggerTooltip = attachedSnippets
    .map((r) => `${r.type.toLowerCase()}: ${r.name}`)
    .join(' · ');

  return (
    <div
      style={{ '--accent': colorHex } as React.CSSProperties}
      className={`group/node relative w-[242px] bg-[#14161d] rounded-[12px] select-none transition-all duration-150 ${
        selected
          ? 'border border-[var(--accent)] shadow-[0_14px_30px_-16px_rgba(0,0,0,0.65),0_0_0_1px_var(--accent)]'
          : 'border border-white/[0.09] shadow-[0_10px_26px_-14px_rgba(0,0,0,0.5)] hover:-translate-y-[1px] hover:shadow-[0_14px_30px_-16px_rgba(0,0,0,0.55)]'
      }`}
    >
      {/* Node Header */}
      <div className="flex items-center gap-2 px-3 pt-[11px] pb-[10px] border-b border-white/[0.09] cursor-grab active:cursor-grabbing">
        <span
          className="w-[7px] h-[7px] rounded-full flex-none"
          style={{ backgroundColor: colorHex }}
        />

        <div
          className="flex-1 min-w-0 nodrag"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditingEntity(true);
          }}
        >
          {editingEntity ? (
            <input
              ref={entityInputRef}
              defaultValue={entity.name}
              onBlur={commitEntityName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEntityName(e);
                if (e.key === 'Escape') setEditingEntity(false);
              }}
              className="w-full bg-transparent text-[13px] font-semibold font-mono tracking-[0.2px] text-[#e8e8ee] outline-none border-b border-[#e08a3c]"
            />
          ) : (
            <span
              className="block text-[13px] font-semibold font-mono tracking-[0.2px] text-[#e8e8ee] truncate"
              title="Double-click to rename table"
            >
              {entity.name}
            </span>
          )}
        </div>

        {/* Trigger Badge (if routines attached) or Add Trigger button on hover */}
        {attachedSnippets.length > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(
                new CustomEvent('open-sql-assistant', {
                  detail: { entityId: id, entityName: entity.name },
                })
              );
            }}
            title={triggerTooltip}
            className="nodrag nopan flex items-center gap-[3px] text-[9.5px] font-mono text-[#8b7ff0] bg-[#8b7ff0]/14 hover:bg-[#8b7ff0]/25 px-1.5 py-0.5 rounded-full flex-none cursor-pointer transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-2 h-2">
              <path d="M13 2 3 14h7l-1 8 11-14h-7z" />
            </svg>
            {attachedSnippets.length}
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(
                new CustomEvent('open-sql-assistant', {
                  detail: { entityId: id, entityName: entity.name },
                })
              );
            }}
            title="Add SQL Trigger / Procedure"
            className="nodrag nopan opacity-0 group-hover/node:opacity-100 flex items-center justify-center w-5 h-5 rounded-[6px] text-[#565766] hover:text-[#8b7ff0] hover:bg-[#8b7ff0]/14 transition-all cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
              <path d="M13 2 3 14h7l-1 8 11-14h-7z" />
            </svg>
          </button>
        )}

        {/* Column Count Pill */}
        <span className="text-[10px] text-[#565766] font-mono bg-white/[0.05] px-[7px] py-[2px] rounded-full flex-none">
          {entity.fields.length}
        </span>

        {/* Delete Table Button */}
        <button
          type="button"
          onClick={handleDeleteEntity}
          title="Delete table"
          className="nodrag nopan w-5 h-5 flex-none rounded-[6px] text-[#565766] hover:bg-[#e0708f]/15 hover:text-[#e0708f] flex items-center justify-center opacity-0 group-hover/node:opacity-100 transition-all cursor-pointer"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="w-3 h-3"
          >
            <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" />
          </svg>
        </button>
      </div>

      {/* Fields List */}
      <div className="flex flex-col py-0.5">
        {entity.fields.map((field) => {
          const isPk = field.isPrimaryKey || field.name === 'id';
          const isFk = !isPk && fkFields.includes(field.name);
          const isInspected =
            inspectorTarget?.entityName === entity.name &&
            inspectorTarget?.fieldName === field.name;

          return (
            <div
              key={field.name}
              onClick={(e) => {
                e.stopPropagation();
                openInspector(entity.name, field.name);
              }}
              className={`group/field relative flex items-center gap-[7px] py-[6.5px] pl-3 pr-2 text-[12px] font-mono transition-colors cursor-pointer ${
                isInspected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.035]'
              }`}
            >
              {/* Left Target Handle */}
              <Handle
                type="target"
                position={Position.Left}
                id={`target-${field.name}`}
                className="nexus-handle !left-[-4px]"
              />

              {/* Key Symbol: ◆ for PK, ○ for FK, · for normal */}
              <span
                className={`w-[13px] flex-none text-center text-[9.5px] ${
                  isPk
                    ? 'text-[#e08a3c]'
                    : isFk
                    ? 'text-[#3fc6d8]'
                    : 'text-[#565766]'
                }`}
              >
                {isPk ? '◆' : isFk ? '○' : '·'}
              </span>

              {/* Field Name */}
              <span className="text-[#e8e8ee] flex-1 truncate">
                {field.name}
              </span>

              {/* Colored Type Pill */}
              <span
                className={`text-[9.5px] px-[7px] py-[2px] rounded-full flex-none tracking-[0.2px] ${
                  TYPE_BADGE_STYLES[field.type] || 'text-[#8a8b9a] bg-white/[0.05]'
                }`}
              >
                {DISPLAY_TYPE_LABELS[field.type] || field.type}
              </span>

              {/* Inspector Trigger Button (⋯) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openInspector(entity.name, field.name);
                }}
                className="nodrag nopan w-[18px] h-[18px] flex-none rounded-[5px] text-[#565766] hover:bg-white/[0.09] hover:text-[#e8e8ee] text-[13px] leading-none flex items-center justify-center opacity-0 group-hover/field:opacity-100 transition-all cursor-pointer"
                title="Edit field"
              >
                ⋯
              </button>

              {/* Right Source Handle */}
              <Handle
                type="source"
                position={Position.Right}
                id={`source-${field.name}`}
                className="nexus-handle !right-[-4px]"
              />
            </div>
          );
        })}

        {/* Subtle Add Column Row on Card Hover */}
        <button
          type="button"
          onClick={handleAddRow}
          className="nodrag nopan mx-2 my-1 py-1 rounded-[6px] text-[10.5px] font-mono text-[#565766] hover:text-[#e08a3c] hover:bg-white/[0.03] opacity-0 group-hover/node:opacity-100 transition-all flex items-center justify-center gap-1 cursor-pointer"
        >
          <span>+</span> Add field
        </button>
      </div>
    </div>
  );
});

EntityNode.displayName = 'EntityNode';